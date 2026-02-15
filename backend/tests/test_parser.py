from app.crawler.parser import Parser


def test_parser_extracts_viewport_meta():
    parser = Parser()
    html = """
    <html>
      <head>
        <title>Test</title>
        <meta name=\"description\" content=\"desc\" />
        <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
      </head>
      <body><h1>Hello</h1></body>
    </html>
    """

    result = parser.parse(html, "https://example.com")

    assert result["viewport"] == "width=device-width, initial-scale=1"


def test_parser_extracts_canonical_robots_and_json_ld():
    parser = Parser()
    html = """
    <html>
      <head>
        <link rel=\"canonical\" href=\"/final-url\" />
        <meta name=\"robots\" content=\"noindex, nofollow\" />
        <script type=\"application/ld+json\">{"@context":"https://schema.org","@type":"Article"}</script>
      </head>
      <body></body>
    </html>
    """

    result = parser.parse(html, "https://example.com/path")

    assert result["canonical"] == "https://example.com/final-url"
    assert result["noindex"] is True
    assert result["nofollow"] is True
    assert result["schema_org_json_ld"][0]["@type"] == "Article"


def test_parser_collects_structured_data_parse_errors():
    parser = Parser()
    html = """
    <html><head><script type=\"application/ld+json\">{"@type":"Broken"</script></head><body></body></html>
    """

    result = parser.parse(html, "https://example.com")

    assert result["structured_data_errors"]
