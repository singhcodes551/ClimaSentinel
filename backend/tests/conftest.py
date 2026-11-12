import pytest
from app.database import Base, engine
import app.models  # Ensure all models are registered with Base.metadata


@pytest.fixture(autouse=True, scope="session")
def setup_test_database():
    """Ensure all SQLAlchemy tables are created for tests."""
    Base.metadata.create_all(bind=engine)
    yield

