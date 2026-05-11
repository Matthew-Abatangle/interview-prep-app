import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from routers.questions import router as questions_router
from routers.sessions import router as sessions_router
from middleware.auth import AuthMiddleware
from routers.transcription import router as transcription_router


load_dotenv()

app = FastAPI()

origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(AuthMiddleware)

app.include_router(questions_router)
app.include_router(sessions_router)
app.include_router(transcription_router)

@app.get("/health")
def health_check():
    return {"status": "ok"}
