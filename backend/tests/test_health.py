from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root_endpoint():
    """Verify the root landing endpoint returns expected metadata."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "ClimaSentinel" in data["message"]
    assert data["version"] == "0.1.0"
    assert data["health_url"] == "/api/v1/health"


def test_health_endpoint():
    """Verify GET /api/v1/health returns 200, healthy status, and active DB connection."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["project"] == "ClimaSentinel"
    assert data["version"] == "0.1.0"
    assert data["database"] == "connected"
    assert "timestamp" in data
    assert data["environment"] == "development"

