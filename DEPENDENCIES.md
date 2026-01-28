# Required Dependencies for Production Setup

This document lists all the additional dependencies you'll need to install for the production-grade setup.

## Backend Dependencies

Run these commands in the `backend` directory:

```bash
cd backend
npm install @supabase/supabase-js @aws-sdk/client-s3 @aws-sdk/s3-request-presigner dotenv jsonwebtoken bcryptjs express-validator helmet
```

### New Dependencies Explained:

1. **@supabase/supabase-js** - Supabase client for database operations
2. **@aws-sdk/client-s3** - AWS SDK for S3-compatible storage (Cloudflare R2)
3. **@aws-sdk/s3-request-presigner** - Generate signed URLs for file downloads
4. **dotenv** - Load environment variables from .env file
5. **jsonwebtoken** - JWT token generation and verification
6. **bcryptjs** - Password hashing
7. **express-validator** - Input validation middleware
8. **helmet** - Security headers middleware

### Updated backend/package.json:

```json
{
  "name": "pdf-protect-backend",
  "version": "1.0.0",
  "main": "server.js",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.0.0",
    "@aws-sdk/s3-request-presigner": "^3.0.0",
    "@supabase/supabase-js": "^2.39.0",
    "archiver": "^7.0.1",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "csv-parser": "^3.2.0",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "express-validator": "^7.0.1",
    "helmet": "^7.1.0",
    "ioredis": "^5.7.0",
    "jsonwebtoken": "^9.0.2",
    "multer": "^2.0.2",
    "nodemailer": "^7.0.6",
    "pdf-lib": "^1.17.1",
    "pdfmake": "^0.2.20",
    "uuid": "^11.1.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.10"
  }
}
```

---

## Frontend Dependencies

Run these commands in the `frontend` directory:

```bash
cd frontend
npm install @supabase/supabase-js axios
```

### New Dependencies Explained:

1. **@supabase/supabase-js** - Supabase client for client-side auth (optional, if using Supabase Auth)
2. **axios** - HTTP client for API requests

### Updated frontend/package.json:

```json
{
  "name": "frontend-pdf-modification",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/modifiers": "^9.0.0",
    "@dnd-kit/sortable": "^10.0.0",
    "@supabase/supabase-js": "^2.39.0",
    "axios": "^1.6.2",
    "pdf-lib": "^1.17.1",
    "pdfjs-dist": "^5.3.93",
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "react-pdf": "^10.1.0",
    "react-router-dom": "^7.8.2"
  },
  "devDependencies": {
    "@eslint/js": "^9.33.0",
    "@types/react": "^19.1.10",
    "@types/react-dom": "^19.1.7",
    "@vitejs/plugin-react": "^5.0.0",
    "eslint": "^9.33.0",
    "eslint-plugin-react-hooks": "^5.2.0",
    "eslint-plugin-react-refresh": "^0.4.20",
    "globals": "^16.3.0",
    "vite": "^7.1.2"
  }
}
```

---

## Optional Dependencies (For Future Features)

### Payment Integration (Stripe)
```bash
cd backend
npm install stripe
```

### Payment Integration (PayPal)
```bash
cd backend
npm install @paypal/checkout-server-sdk
```

### Error Tracking (Sentry)
```bash
cd backend
npm install @sentry/node
cd ../frontend
npm install @sentry/react
```

### Queue Processing (Bull - for background jobs)
```bash
cd backend
npm install bull
```

### Email Service (if not using Supabase Auth)
```bash
cd backend
npm install nodemailer  # Already installed
```

---

## Installation Commands Summary

### Quick Install (Backend)
```bash
cd backend
npm install @supabase/supabase-js @aws-sdk/client-s3 @aws-sdk/s3-request-presigner dotenv jsonwebtoken bcryptjs express-validator helmet
```

### Quick Install (Frontend)
```bash
cd frontend
npm install @supabase/supabase-js axios
```

### Full Install (All Dependencies)
```bash
# Backend
cd backend
npm install @supabase/supabase-js @aws-sdk/client-s3 @aws-sdk/s3-request-presigner dotenv jsonwebtoken bcryptjs express-validator helmet

# Frontend
cd ../frontend
npm install @supabase/supabase-js axios
```

---

## Verification

After installing, verify the packages:

```bash
# Backend
cd backend
npm list @supabase/supabase-js @aws-sdk/client-s3 dotenv jsonwebtoken

# Frontend
cd ../frontend
npm list @supabase/supabase-js axios
```

All packages should be listed without errors.

---

## Notes

- **dotenv**: Make sure to call `dotenv.config()` at the top of your server.js file
- **@supabase/supabase-js**: Use version 2.x for the latest features
- **@aws-sdk/client-s3**: Version 3.x is the latest and works with Cloudflare R2
- **jsonwebtoken**: Make sure to set strong JWT secrets in your .env file
- **bcryptjs**: Use async/await for password hashing operations

---

## Troubleshooting

**Installation fails?**
- Make sure Node.js version is 18+
- Clear npm cache: `npm cache clean --force`
- Delete `node_modules` and `package-lock.json`, then reinstall

**Type errors?**
- Some packages may need TypeScript types: `npm install --save-dev @types/bcryptjs @types/jsonwebtoken`

**Version conflicts?**
- Check existing package versions
- Use `npm install package@latest` to update specific packages
