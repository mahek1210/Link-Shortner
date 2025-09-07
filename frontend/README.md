# Link Shortener Frontend

A modern React frontend for the Advanced URL Shortener application.

## Features

### 🔐 Authentication
- User registration and login
- JWT token management
- Protected routes
- Automatic token refresh

### 📊 Dashboard
- Create and manage short URLs
- View click statistics
- Search and filter links
- Pagination support
- Copy links to clipboard

### 📈 Analytics
- Detailed click analytics
- Device and browser breakdown
- Visit logs with timestamps
- Interactive charts with Recharts

### 🛡️ Admin Panel
- User management
- URL monitoring
- System statistics
- Content moderation

### 🎨 Modern UI
- Clean, responsive design
- TailwindCSS styling
- Framer Motion animations
- shadcn/ui components

## Tech Stack

- **React 18** with TypeScript
- **React Router** for navigation
- **TailwindCSS** for styling
- **Framer Motion** for animations
- **Recharts** for data visualization
- **Axios** for API calls
- **Lucide React** for icons

## Getting Started

### Prerequisites
- Node.js 16+ 
- Backend API running on `http://localhost:5000`

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file:
   ```env
   REACT_APP_API_URL=http://localhost:5000/api
   ```

3. Start the development server:
   ```bash
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # Base UI components (Button, Input, etc.)
│   ├── Navbar.tsx      # Navigation bar
│   ├── ProtectedRoute.tsx
│   ├── CreateUrlModal.tsx
│   ├── QRModal.tsx
│   └── AnalyticsModal.tsx
├── contexts/           # React contexts
│   └── AuthContext.tsx # Authentication state
├── lib/               # Utility functions
│   └── utils.ts       # Helper functions
├── pages/             # Page components
│   ├── LoginPage.tsx
│   ├── SignupPage.tsx
│   ├── DashboardPage.tsx
│   └── AdminPage.tsx
├── services/          # API services
│   └── api.ts         # API client and endpoints
├── types/             # TypeScript types
│   └── index.ts       # Type definitions
├── App.tsx            # Main app component
└── index.tsx          # App entry point
```

## Available Scripts

- `npm start` - Start development server
- `npm build` - Build for production
- `npm test` - Run tests
- `npm eject` - Eject from Create React App

## API Integration

The frontend communicates with the backend API through the `api.ts` service file. All API calls include:

- Automatic JWT token inclusion
- Error handling
- Request/response interceptors
- Authentication state management

## Styling

The app uses TailwindCSS with a custom design system based on shadcn/ui:

- CSS variables for theming
- Responsive design
- Dark mode support (ready)
- Consistent spacing and typography

## Deployment

### Build for Production
```bash
npm run build
```

### Environment Variables
Set the following environment variables for production:

```env
REACT_APP_API_URL=https://your-api-domain.com/api
```

## Contributing

1. Follow the existing code style
2. Use TypeScript for all new components
3. Add proper error handling
4. Test your changes thoroughly

## License

This project is part of the Advanced URL Shortener application.
