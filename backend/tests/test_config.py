from app.config import Settings


def test_parse_allowed_origins_returns_safe_defaults_for_empty_value():
    origins = Settings._parse_allowed_origins("")

    assert origins == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


def test_parse_allowed_origins_supports_single_domain():
    origins = Settings._parse_allowed_origins("https://app.example.com")

    assert origins == ["https://app.example.com"]


def test_parse_allowed_origins_supports_comma_separated_domains():
    origins = Settings._parse_allowed_origins("https://app.example.com, https://admin.example.com")

    assert origins == ["https://app.example.com", "https://admin.example.com"]


def test_parse_allowed_origins_supports_json_array():
    origins = Settings._parse_allowed_origins('["https://app.example.com", "https://admin.example.com"]')

    assert origins == ["https://app.example.com", "https://admin.example.com"]
