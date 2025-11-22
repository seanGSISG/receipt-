# add-product Edge Function

## Overview
This edge function handles adding products to a user's inventory. It accepts a barcode, fetches product data, and inserts it into the database with an auto-calculated expiration date.

## Step 2: Local Deployment (May not work in all environments)

**Command:**
```bash
supabase functions serve add-product
```

**Expected Behavior:**
- Edge function should be served locally at: `http://localhost:54321/functions/v1/add-product`
- Deno runtime will load the function
- Function will be ready to accept HTTP requests

**Note:** This requires Supabase CLI to be installed and Supabase to be running locally (`supabase start`).

**Error Handling:**
If you see `supabase: command not found`, you need to install the Supabase CLI:
```bash
npm install -g supabase
```

## Step 3: Testing with curl (May not work due to network restrictions)

**Command:**
```bash
curl -X POST http://localhost:54321/functions/v1/add-product \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"barcode": "012345678905", "quantity": 1}'
```

**Expected Response:**
```json
{
  "success": true,
  "product": {
    "barcode": "012345678905",
    "quantity": 1,
    "manual_expiry": null
  }
}
```

**Response Codes:**
- `200 OK` - Success (returns product placeholder)
- `400 Bad Request` - Missing barcode
- `401 Unauthorized` - Invalid or missing auth token
- `500 Internal Server Error` - Server error

**Current Implementation Status:**
This is Part 1 (Setup) - the function returns a placeholder response. Task 11 will add OpenFoodFacts integration for real product data.

## File Structure
```
supabase/functions/add-product/
├── index.ts           # Main edge function handler
└── README.md         # This file
```

## Next Steps
- Task 11 will add `openfoodfacts.ts` for product data fetching
- Integration with product_cache table
- Automatic expiration date calculation
- Inventory insertion
