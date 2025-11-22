import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fetchProductData } from './openfoodfacts.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get user from auth token
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { barcode, quantity = 1, manual_expiry } = await req.json()

    if (!barcode) {
      return new Response(
        JSON.stringify({ error: 'Barcode is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check product cache first
    const { data: cached } = await supabase
      .from('product_cache')
      .select('product_data')
      .eq('barcode', barcode)
      .single()

    let productData

    if (cached) {
      productData = cached.product_data
    } else {
      // Fetch from OpenFoodFacts
      const fetchedData = await fetchProductData(barcode)

      if (!fetchedData) {
        return new Response(
          JSON.stringify({ error: 'Product not found', unknown: true }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      productData = fetchedData

      // Cache the product data
      await supabase.from('product_cache').insert({
        barcode,
        product_data: productData,
      })
    }

    // Calculate expiration date
    const addedDate = new Date().toISOString().split('T')[0]
    let expirationDate

    if (manual_expiry) {
      expirationDate = manual_expiry
    } else {
      // Call calculate_expiration function
      const { data: expiry } = await supabase.rpc('calculate_expiration', {
        p_category: productData.category,
        p_added_date: addedDate,
      })
      expirationDate = expiry
    }

    // Insert into inventory
    const { data: inventoryItem, error: insertError } = await supabase
      .from('inventory')
      .insert({
        user_id: user.id,
        barcode,
        product_name: productData.name,
        category: productData.category,
        image_url: productData.image_url,
        quantity,
        expiration_date: expirationDate,
        manual_expiry_override: !!manual_expiry,
      })
      .select()
      .single()

    if (insertError) {
      throw insertError
    }

    return new Response(
      JSON.stringify({
        success: true,
        product: inventoryItem,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
