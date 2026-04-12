# Family Finance App — Setup Guide

Welcome! This guide will get your family finance app live on the internet in about 20–30 minutes. You'll need free accounts on three services: **Supabase** (database + logins), **GitHub** (code storage), and **Vercel** (hosting).

---

## Prerequisites

- **Node.js 18+** — Download from [nodejs.org](https://nodejs.org) (choose the LTS version)
- A free **Supabase** account — [supabase.com](https://supabase.com)
- A free **GitHub** account — [github.com](https://github.com)
- A free **Vercel** account — [vercel.com](https://vercel.com) (sign up with your GitHub account)

---

## Step 1: Set Up Supabase (Database + Auth)

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **"New Project"**
3. Give it a name (e.g. `family-finance`) and set a strong database password — save this password somewhere safe
4. Choose the region closest to you and click **"Create new project"**
5. Wait about a minute for it to finish setting up

### Run the Database Schema

6. In your Supabase project, click **"SQL Editor"** in the left sidebar
7. Click **"New query"**
8. Open the file `supabase/schema.sql` from this project folder
9. Copy the entire contents and paste it into the SQL editor
10. Click **"Run"** (the green button)
11. You should see a success message — your database is ready!

### Get Your API Keys

12. In Supabase, go to **Project Settings** (gear icon) → **API**
13. Copy your **Project URL** — it looks like `https://abcdefghij.supabase.co`
14. Copy your **anon / public** key — it's a long string starting with `eyJ...`
15. Keep these handy for Step 3

---

## Step 2: Put the Code on GitHub

1. Go to [github.com](https://github.com) and click **"New repository"**
2. Name it `family-finance`, set it to **Private**, and click **"Create repository"**
3. Open **Terminal** (Mac) or **Command Prompt** (Windows) on your computer
4. Navigate to the `family-finance` folder:
   ```bash
   cd path/to/family-finance
   ```
5. Run these commands one at a time:
   ```bash
   npm install
   git init
   git add .
   git commit -m "Initial family finance app"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/family-finance.git
   git push -u origin main
   ```
   *(Replace `YOUR_USERNAME` with your actual GitHub username)*

---

## Step 3: Test It Locally First (Optional but Recommended)

1. In the `family-finance` folder, copy the example env file:
   ```bash
   cp .env.local.example .env.local
   ```
2. Open `.env.local` in any text editor and fill in your Supabase details:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key...
   ```
3. Start the app:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser
5. It will show a login page — you'll add family members in the next step

---

## Step 4: Add Family Members (Logins)

This is how you create accounts so only your family can log in:

1. In Supabase, go to **Authentication** → **Users**
2. Click **"Invite user"**
3. Enter a family member's email address and click **"Send invite"**
4. They'll receive an email with a link to set their own password
5. Repeat for each family member (up to 6 accounts on the free plan is fine)

> **Note:** The person who created the Supabase account can also log in — just go to Authentication → Users, click "Add user", and set an email + password for yourself directly.

---

## Step 5: Deploy to Vercel (Go Live!)

1. Go to [vercel.com](https://vercel.com) and sign in with your GitHub account
2. Click **"New Project"**
3. Find your `family-finance` repository and click **"Import"**
4. Before clicking Deploy, click **"Environment Variables"** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` → your Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → your Supabase anon key
5. Click **"Deploy"**
6. Wait about 2 minutes — Vercel will build and deploy your app
7. You'll get a URL like `https://family-finance-xyz.vercel.app` — that's your live website!

> **Tip:** You can set a custom domain name in Vercel's project settings if you want something like `myfamilyfinance.com`. Domain names cost around $10–15/year.

---

## Step 6: Set Your Starting Balance

Once you're logged in, you have two options:

**Option A (easier) — via the app:**
- Go to the Dashboard and click **"+ Add Deposit"**
- Enter your current bank balance as a deposit with description "Starting balance"

**Option B — via Supabase SQL:**
- Go to Supabase → SQL Editor → New query
- Run this (replace `5000.00` with your actual balance):
  ```sql
  UPDATE balance SET amount = 5000.00 WHERE id = (SELECT id FROM balance LIMIT 1);
  ```

---

## Step 7: Add Your Bills

1. Go to the **Bills** page
2. Click **"+ Add Bill"**
3. Add each recurring bill (rent, utilities, subscriptions, etc.)
4. For recurring bills, check the "Recurring Bill" box and choose weekly/monthly/yearly
5. When you pay a bill, click **"Mark Paid"** — it automatically deducts from your balance and creates a new bill for next time

---

## How the App Works (Quick Reference)

| Action | What Happens |
|--------|-------------|
| Add Deposit | Balance goes up, transaction recorded |
| Mark Bill as Paid | Balance goes down, transaction recorded, next bill auto-created (if recurring) |
| Add Bill | Appears in unpaid bills list and dashboard |
| Delete Bill | Permanently removed (balance not affected) |

---

## Free Tier Limits

Both Supabase and Vercel have generous free plans:

- **Supabase Free:** 500MB database, 50,000 monthly active users, unlimited API requests
- **Vercel Free (Hobby):** Unlimited deployments, custom domains, plenty for a family app

These limits are far more than enough for a family finance app.

---

## Making Updates

Whenever you want to change the app, edit the code files and run:
```bash
git add .
git commit -m "Description of what you changed"
git push
```
Vercel will automatically detect the push and redeploy within a couple of minutes.

---

## Need Help?

- **Supabase docs:** [supabase.com/docs](https://supabase.com/docs)
- **Vercel docs:** [vercel.com/docs](https://vercel.com/docs)
- **Next.js docs:** [nextjs.org/docs](https://nextjs.org/docs)
