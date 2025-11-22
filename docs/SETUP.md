# Setup Guide

## Local Development

### 1. Supabase Setup

Initialize and start Supabase:
```bash
supabase init
supabase start
```

Note the `API URL` and `anon key` from the output.

### 2. Environment Variables

Create `.env.local`:
```
VITE_SUPABASE_URL=<your-api-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### 3. Database Migrations

Migrations run automatically when you start Supabase.

To create a new migration:
```bash
supabase migration new <migration-name>
```

To reset the database:
```bash
supabase db reset
```

### 4. Edge Functions

Deploy edge functions locally:
```bash
supabase functions serve
```

Deploy specific function:
```bash
supabase functions serve add-product
```

## Production Deployment

### 1. Supabase Cloud

Create a project at https://supabase.com

Link your local project:
```bash
supabase link --project-ref <your-project-ref>
```

Push migrations:
```bash
supabase db push
```

Deploy edge functions:
```bash
supabase functions deploy add-product
```

### 2. Frontend Hosting (Vercel)

1. Connect your GitHub repo to Vercel
2. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy

## Troubleshooting

### Camera not working
- Ensure HTTPS (camera requires secure context)
- Check browser permissions
- Try manual entry as fallback

### Supabase connection failed
- Verify `.env.local` variables
- Check if Supabase is running (`supabase status`)
- Restart Supabase (`supabase stop && supabase start`)

### Database schema out of sync
```bash
supabase db reset
```
