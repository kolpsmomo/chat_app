from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class Message(Base):
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), nullable=False)
    text = Column(String(500), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)