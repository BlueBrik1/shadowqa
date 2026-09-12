from shadowqa.sourcemap import SourceMap, SourceMapResolver, decode_vlq, parse_stack


def test_vlq_decoding():
    assert decode_vlq("A") == [0]
    assert decode_vlq("C") == [1]
    assert decode_vlq("D") == [-1]
    assert decode_vlq("AAgBC") == [0, 0, 16, 1]


def test_sourcemap_lookup_maps_generated_to_original():
    # generated line 1 col 0 → src 0 line 1 col 0; col 8 → src 0 line 3 col 4; generated line 2 → src 1 line 1
    smap = SourceMap({"sources": ["webpack://frontend/./src/a.js", "webpack://frontend/./src/b.js"], "names": [],
                      "mappings": "AAAA,QAEI;ACFA"})
    assert smap.lookup(1, 1) == {"source": "webpack://frontend/./src/a.js", "line": 1, "column": 1}
    assert smap.lookup(1, 12) == {"source": "webpack://frontend/./src/a.js", "line": 3, "column": 5}
    assert smap.lookup(2, 1)["source"].endswith("b.js")
    assert smap.lookup(9, 1) is None


def test_normalize_source_paths():
    n = SourceMapResolver.normalize_source
    assert n("/app/frontend/src/demo/pages/Checkout.jsx", ["webpack://frontend/./"], "frontend", "/app") == ("frontend/src/demo/pages/Checkout.jsx", False)
    assert n("webpack://frontend/./src/demo/api/payments.js", ["webpack://frontend/./"], "frontend", "/app") == ("frontend/src/demo/api/payments.js", False)
    assert n("webpack:///./node_modules/react-dom/index.js", ["webpack:///./"], "frontend", "/app")[1] is True


def test_parse_stack_v8_and_gecko():
    v8 = """TypeError: boom
    at handlePay (https://host.example/static/js/bundle.js:45123:34)
    at async dispatch (https://host.example/static/js/bundle.js:9:1)"""
    frames = parse_stack(v8)
    assert frames[0] == {"function": "handlePay", "url": "https://host.example/static/js/bundle.js", "line": 45123, "column": 34}
    assert frames[1]["function"] == "async dispatch"
    gecko = "handlePay@http://localhost:3000/static/js/bundle.js:10:5"
    assert parse_stack(gecko)[0]["line"] == 10
    assert parse_stack(None) == []
