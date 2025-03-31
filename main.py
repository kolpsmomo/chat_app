import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from models import Message
from database import init_db, async_session
import uuid
from typing import Dict

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[WebSocket, Dict] = {}

    async def connect(self, websocket: WebSocket, username: str, client_id: str):
        await websocket.accept()
        self.active_connections[websocket] = {
            "username": username,
            "client_id": client_id
        }

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            del self.active_connections[websocket]

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

    def is_username_taken(self, username: str, current_websocket: WebSocket = None):
        for websocket, data in self.active_connections.items():
            if websocket != current_websocket and data["username"] == username:
                return True
        return False

manager = ConnectionManager()

@app.on_event("startup")
async def on_startup():
    await init_db()

@app.websocket("/ws/{username}/{client_id}")
async def websocket_endpoint(
    websocket: WebSocket, 
    username: str,
    client_id: str
):
    if manager.is_username_taken(username, websocket):
        await websocket.send_text(json.dumps({
            "username": "Система",
            "text": "Это имя уже занято. Пожалуйста, перезагрузите страницу.",
            "timestamp": datetime.utcnow().isoformat()
        }))
        await websocket.close()
        return

    await manager.connect(websocket, username, client_id)
    
    try:
        # Отправляем историю сообщений
        async with async_session() as session:
            result = await session.execute(select(Message).order_by(Message.timestamp))
            messages = result.scalars().all()
            
            for message in messages:
                await websocket.send_text(json.dumps({
                    "id": message.id,
                    "username": message.username,
                    "text": message.text,
                    "timestamp": message.timestamp.isoformat()
                }))
        
        # Уведомление о входе
        await manager.broadcast(json.dumps({
            "username": "Система",
            "text": f"{username} вошёл в чат",
            "timestamp": datetime.utcnow().isoformat(),
            "type": "system"
        }))
        
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            if message_data.get("type") == "delete":
                # Обработка удаления сообщения
                async with async_session() as session:
                    # Проверяем права на удаление
                    message = (await session.execute(
                        select(Message).where(Message.id == message_data["message_id"])
                    )).scalar_one_or_none()
                    
                    if message and (username == "aspect" or message.username == username):
                        await session.execute(
                            delete(Message).where(Message.id == message_data["message_id"])
                        )
                        await session.commit()
                        
                        await manager.broadcast(json.dumps({
                            "type": "delete",
                            "message_id": message_data["message_id"]
                        }))
            else:
                # Обычное сообщение
                message = Message(
                    username=username,
                    text=message_data["text"],
                    timestamp=datetime.utcnow()
                )
                
                async with async_session() as session:
                    session.add(message)
                    await session.commit()
                    await session.refresh(message)
                
                await manager.broadcast(json.dumps({
                    "id": message.id,
                    "username": username,
                    "text": message_data["text"],
                    "timestamp": message.timestamp.isoformat(),
                    "type": "message"
                }))
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast(json.dumps({
            "username": "Система",
            "text": f"{username} покинул чат",
            "timestamp": datetime.utcnow().isoformat(),
            "type": "system"
        }))

@app.get("/", response_class=HTMLResponse)
async def get(request: Request):
    return templates.TemplateResponse("index.html", {
        "request": request,
        "client_id": str(uuid.uuid4())
    })

@app.get("/check_username/{username}")
async def check_username(username: str):
    return {
        "available": not manager.is_username_taken(username)
    }