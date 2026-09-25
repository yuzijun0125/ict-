import os
from pathlib import Path
from typing import List, Optional
import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from tokenizers import Tokenizer

MODEL_DIR = Path(os.environ.get("RERANK_MODEL_DIR", "/mnt/d/NexentModels/reranker/jina-reranker-v2-base-multilingual"))
API_KEY = os.environ.get("RERANK_API_KEY", "")
PORT = int(os.environ.get("RERANK_PORT", "8091"))
MAX_DOCUMENTS = int(os.environ.get("RERANK_MAX_DOCUMENTS", "64"))
MAX_LENGTH = int(os.environ.get("RERANK_MAX_LENGTH", "512"))

app = FastAPI(title="Nexent Local Rerank Service", version="0.1.0")
_tokenizer = None
_session = None
_lock = None

class RerankRequest(BaseModel):
    model: Optional[str] = None
    query: str = Field(min_length=1)
    documents: List[str]
    top_n: Optional[int] = None

def get_runtime():
    global _tokenizer, _session, _lock
    if _session is None:
        import threading
        _tokenizer = Tokenizer.from_file(str(MODEL_DIR / "tokenizer.json"))
        _tokenizer.enable_truncation(max_length=MAX_LENGTH)
        _tokenizer.enable_padding(pad_id=1, pad_token="<pad>")
        options = ort.SessionOptions()
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        _session = ort.InferenceSession(str(MODEL_DIR / "model_quantized.onnx"), sess_options=options, providers=["CPUExecutionProvider"])
        _lock = threading.Lock()
    return _tokenizer, _session, _lock

def check_auth(authorization: Optional[str]):
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="unauthorized")

@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_DIR.name, "provider": "onnxruntime", "device": "cpu"}

@app.post("/rerank")
@app.post("/v1/rerank")
def rerank(payload: RerankRequest, authorization: Optional[str] = Header(default=None)):
    check_auth(authorization)
    documents = [doc for doc in payload.documents if isinstance(doc, str)]
    if not documents:
        return {"results": []}
    documents = documents[:MAX_DOCUMENTS]
    tokenizer, session, lock = get_runtime()
    encoded = tokenizer.encode_batch([(payload.query, document) for document in documents])
    input_ids = np.asarray([item.ids for item in encoded], dtype=np.int64)
    attention_mask = np.asarray([item.attention_mask for item in encoded], dtype=np.int64)
    with lock:
        logits = session.run(None, {"input_ids": input_ids, "attention_mask": attention_mask})[0]
    scores = [float(1.0 / (1.0 + np.exp(-row[0]))) for row in logits]
    ranked = sorted(enumerate(scores), key=lambda item: item[1], reverse=True)
    if payload.top_n is not None:
        ranked = ranked[:max(1, min(payload.top_n, len(ranked)))]
    return {
        "model": payload.model or MODEL_DIR.name,
        "results": [
            {"index": index, "relevance_score": score, "document": documents[index]}
            for index, score in ranked
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)