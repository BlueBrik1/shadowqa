PRODUCTS = [
    {
        "id": "lum-01", "name": "Kodiak Field Anvil Knife", "tagline": "Grade-5 Titanium & D2 Tool Steel", "price": 285.00,
        "category": "Edge & Craft", "rating": 4.9, "reviews": 128, "stock": 14,
        "image": "https://images.unsplash.com/photo-1588202807093-b41294df13af?auto=format&fit=crop&w=900&q=80",
        "description": "Engineered for harsh sub-alpine environments. Hand-beveled Japanese steel edge with micarta scale grip and cryo-quenched core.",
        "specs": {"Steel": "D2 Tool Steel (60 HRC)", "Handle": "Canvas Micarta", "Blade Length": "4.2 in", "Weight": "6.8 oz"},
    },
    {
        "id": "lum-02", "name": "Beacon No. 4 Brass Mantle Lantern", "tagline": "Pressurized Cold-Rolled Brass", "price": 195.00,
        "category": "Camp & Illumination", "rating": 4.8, "reviews": 94, "stock": 8,
        "image": "https://images.unsplash.com/photo-1620354723625-c879c24d9c2a?auto=format&fit=crop&w=900&q=80",
        "description": "Spun brass reservoir with precision needle valve. 420 lumen omnidirectional warm light rated for 28 knot crosswinds.",
        "specs": {"Fuel": "White Gas / Kerosene", "Output": "420 Lumens", "Runtime": "18 Hours", "Material": "Solid C3604 Brass"},
    },
    {
        "id": "lum-03", "name": "Hauler 48L Expedition Rucksack", "tagline": "Waxed 18oz Cotton Canvas & Bridle Leather", "price": 340.00,
        "category": "Pack & Carry", "rating": 5.0, "reviews": 210, "stock": 5,
        "image": "https://images.unsplash.com/photo-1547949003-9792a18a2601?auto=format&fit=crop&w=900&q=80",
        "description": "Internal aluminum stays coupled with English bridle harness leather. Weatherproof roll-top seal with heavy storm flaps.",
        "specs": {"Capacity": "48 Liters", "Fabric": "18oz Martexin Waxed Duck", "Hardware": "Solid Cast Bronze", "Weight": "3.2 lbs"},
    },
    {
        "id": "lum-04", "name": "Vessel Ti-16 Pocket Flask", "tagline": "Single-Piece Titanium Hydroformed Shell", "price": 120.00,
        "category": "Field Bar", "rating": 4.7, "reviews": 67, "stock": 22,
        "image": "https://images.unsplash.com/photo-1525740353756-92f4fbde1625?auto=format&fit=crop&w=900&q=80",
        "description": "Zero flavor leaching, ultralight biocompatible titanium. Knurled threaded cap with food-grade silicone ring.",
        "specs": {"Volume": "16 fl oz / 470 ml", "Wall": "0.6 mm Grade 2 Ti", "Weight": "3.1 oz", "Finish": "Raw Stone Wash"},
    },
    {
        "id": "lum-05", "name": "Ironwood Work Overshirt", "tagline": "14oz Blanket-Lined Heavy Duck Cloth", "price": 240.00,
        "category": "Apparel", "rating": 4.9, "reviews": 88, "stock": 11,
        "image": "https://images.unsplash.com/photo-1606925986960-7ef32f97f83d?auto=format&fit=crop&w=900&q=80",
        "description": "Triple needle chainstitch on stress points. Brushed wool blend interior with copper tack shank buttons.",
        "specs": {"Shell": "100% Cotton 14oz Canvas", "Lining": "60% Recycled Wool", "Origin": "Pacific Northwest", "Fit": "Tailored Work"},
    },
    {
        "id": "lum-06", "name": "Ridge Split-Timber Hatchet", "tagline": "Drop-Forged Swedish 5160 High-Carbon Steel", "price": 210.00,
        "category": "Edge & Craft", "rating": 4.8, "reviews": 115, "stock": 6,
        "image": "https://images.unsplash.com/photo-1567141241030-9dea446dc13b?auto=format&fit=crop&w=900&q=80",
        "description": "Balanced 1.75 lb head mounted to kiln-dried Grade-A hickory with boiled linseed oil finish. Hand-stitched welted sheath.",
        "specs": {"Handle": "American Hickory 19 in", "Head": "5160 Spring Steel", "Bevel": "25° convex", "Sheath": "Vegetable Tanned Cowhide"},
    },
]

SEED_ORDERS = [
    {"id": "LUM-8817", "created_at": "2026-05-28T14:12:00+00:00", "status": "delivered", "amount": 405.00, "currency": "USD",
     "items": [{"product_id": "lum-02", "name": "Beacon No. 4 Brass Mantle Lantern", "qty": 1, "price": 195.00},
               {"product_id": "lum-06", "name": "Ridge Split-Timber Hatchet", "qty": 1, "price": 210.00}],
     "customer": {"name": "Demo", "address": "1 Ridge Road", "city": "Bend", "postal_code": "97701"}},
    {"id": "LUM-8842", "created_at": "2026-06-04T09:47:00+00:00", "status": "shipped", "amount": 240.00, "currency": "USD",
     "items": [{"product_id": "lum-05", "name": "Ironwood Work Overshirt", "qty": 1, "price": 240.00}],
     "customer": {"name": "Demo", "address": "1 Ridge Road", "city": "Bend", "postal_code": "97701"}},
    {"id": "LUM-8871", "created_at": "2026-06-11T18:03:00+00:00", "status": "processing", "amount": 120.00, "currency": "USD",
     "items": [{"product_id": "lum-04", "name": "Vessel Ti-16 Pocket Flask", "qty": 1, "price": 120.00}],
     "customer": {"name": "Demo", "address": "1 Ridge Road", "city": "Bend", "postal_code": "97701"}},
]

FAQ = [
    {"q": "How long does shipping take?", "a": "Orders leave the Bend workshop within two business days. Domestic delivery takes 3–5 days; free above $300."},
    {"q": "Can I return a knife or hatchet?", "a": "Edged goods can be returned unused within 30 days. Sharpened or used tools are covered by the lifetime repair program instead."},
    {"q": "Do promo codes stack?", "a": "One code per order. Codes are case-insensitive — LUMEN20 and lumen20 are the same code."},
    {"q": "Where are your goods made?", "a": "Canvas, leather and brass work happens in Bend, Oregon. Blades are forged by partner smiths in Seki and Eskilstuna."},
]
