import json
from datetime import datetime, timezone
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, Column, Integer, String, DateTime
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.ext.declarative import declarative_base
import uuid
from typing import Dict

# Настройка базы данных
DATABASE_URL = "sqlite+aiosqlite:///./chat.db"
Base = declarative_base()

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), nullable=False)
    text = Column(String(500), nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

engine = create_async_engine(DATABASE_URL, echo=True)
async_session = async_sessionmaker(engine, expire_on_commit=False)

# Настройка FastAPI
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Менеджер подключений WebSocket
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[WebSocket, Dict] = {}

    async def connect(self, websocket: WebSocket, username: str, client_id: str):
        await websocket.accept()
        self.active_connections[websocket] = {"username": username, "client_id": client_id}

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            del self.active_connections[websocket]

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"Broadcast error: {e}")

manager = ConnectionManager()

# Инициализация базы данных
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

@app.on_event("startup")
async def on_startup():
    await init_db()
    print("Database initialized")

# WebSocket endpoint
@app.websocket("/ws/{username}/{client_id}")
async def websocket_endpoint(websocket: WebSocket, username: str, client_id: str):
    await manager.connect(websocket, username, client_id)
    print(f"New connection: {username} ({client_id})")

    try:
        # Отправляем историю сообщений
        async with async_session() as session:
            result = await session.execute(select(Message).order_by(Message.timestamp))
            messages = result.scalars().all()
            
            for msg in messages:
                await websocket.send_json({
                    "id": msg.id,
                    "username": msg.username,
                    "text": msg.text,
                    "timestamp": msg.timestamp.isoformat(),
                    "type": "message"
                })

        while True:
            data = await websocket.receive_text()
            msg_data = json.loads(data)
            
            # Сохраняем сообщение в БД
            new_msg = Message(
                username=username,
                text=msg_data["text"],
                timestamp=datetime.now(timezone.utc)
            )
            
            async with async_session() as session:
                session.add(new_msg)
                await session.commit()
                await session.refresh(new_msg)
            
            # Рассылаем сообщение всем
            await manager.broadcast({
                "id": new_msg.id,
                "username": username,
                "text": msg_data["text"],
                "timestamp": new_msg.timestamp.isoformat(),
                "type": "message"
            })

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast({
            "username": "System",
            "text": f"{username} покинул чат",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "type": "system"
        })
    except Exception as e:
        print(f"WebSocket error: {str(e)}")

# Frontend
@app.get("/", response_class=HTMLResponse)
async def get(request: Request):
    return templates.TemplateResponse("index.html", {
        "request": request,
        "client_id": str(uuid.uuid4())
    })

# Проверка имени пользователя
@app.get("/check_username/{username}")
async def check_username(username: str):
    return {"available": True}  # Упрощенная проверка

# Тестовый эндпоинт для проверки БД
@app.get("/test_db")
async def test_db():
    async with async_session() as session:
        result = await session.execute(select(Message))
        messages = result.scalars().all()
        return {
            "status": "ok",
            "message_count": len(messages),
            "sample_messages": [{"id": m.id, "user": m.username} for m in messages[:3]]
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)