from fastapi import FastAPI

app = FastAPI(title="Car Assessment API")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Сервер работает!"}