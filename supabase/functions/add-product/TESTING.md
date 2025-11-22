# Testing Notes for add-product Edge Function

## Code-Level Verification
✅ Files created successfully:
- `openfoodfacts.ts` - OpenFoodFacts API integration module
- `index.ts` - Updated with full product lookup and inventory insertion logic

## Implementation Details
The function now:
1. Checks product_cache table for existing product data
2. If not cached, fetches from OpenFoodFacts API (https://world.openfoodfacts.org)
3. Maps OpenFoodFacts categories to our internal categories
4. Calculates expiration dates using the database function
5. Inserts product into user's inventory
6. Returns complete inventory item with all fields

## Network Test Limitation
⚠️ **Cannot test with real barcode via curl** due to environment restrictions:
- Supabase CLI not available in this environment
- Local Supabase instance not running
- Network access to OpenFoodFacts API cannot be verified from this environment

## Manual Test Instructions
To test locally when Supabase is running:

```bash
# Start Supabase
supabase start

# Get your anon key from the output
# Then test with curl:
curl -X POST http://localhost:54321/functions/v1/add-product \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"barcode": "3017620422003", "quantity": 1}'
```

Expected response for barcode 3017620422003 (Nutella):
```json
{
  "success": true,
  "product": {
    "id": "...",
    "user_id": "...",
    "barcode": "3017620422003",
    "product_name": "Nutella",
    "category": "Pantry",
    "image_url": "https://...",
    "quantity": 1,
    "expiration_date": "2025-11-22",
    "days_until_expiry": 365,
    "is_expired": false
  }
}
```

## Code Review Checklist
✅ TypeScript interfaces defined for API response
✅ Error handling for failed API requests
✅ Product not found returns 404 with unknown flag
✅ Category inference with sensible defaults
✅ Product data caching to reduce API calls
✅ Proper CORS headers configured
✅ Authentication check implemented
✅ Database RPC call for expiration calculation
✅ Inventory insertion with all required fields
