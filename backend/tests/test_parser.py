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
