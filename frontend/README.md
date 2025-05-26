# React Frontend Setup

This project is a basic React application setup using TypeScript. Below are the details for setting up and running the application.

## Project Structure

```
frontend
├── public
│   ├── index.html
│   └── favicon.ico
├── src
│   ├── App.css
│   ├── App.tsx
│   ├── index.css
│   ├── index.tsx
│   └── components
│       └── ExampleComponent.tsx
├── package.json
├── tsconfig.json
└── README.md
```

## Getting Started

1. **Clone the repository:**
   ```
   git clone <repository-url>
   cd frontend
   ```

2. **Install dependencies:**
   ```
   npm install
   ```

3. **Run the application:**
   ```
   npm start
   ```

4. **Open your browser:**
   Navigate to `http://localhost:3000` to view the application.

## Features

- A simple React application structure with TypeScript.
- Example component included for demonstration.

## Deployment Instructions

### Simple

Run `npm run deploy`

### Advanced

1. **Build the React App**:
   ```bash
   npm run build
   ```
   This will generate a `build` folder containing the production-ready React app.

2. **Deploy the CDK Stack**:
   ```bash
   cdk deploy
   ```
   This command will:
   - Update S3 bucket with React web app

3. **Invalidate CloudFront Cache**:
   ```bash
   aws cloudfront create-invalidation --distribution-id EE079INK46INE --paths '/*'
   ```
   This will invalidate Cloudfront caches to ensure all users see latest content.

4. **Verify Deployment**:
   - Visit `https://streventools.com` to ensure the app is live.

### Notes

- If you make changes to the React app, rebuild it using `npm run build` and redeploy using `cdk deploy`.
- Ensure your AWS account has the necessary permissions to create S3 buckets, Route 53 records, and other resources.

## License

This project is licensed under the MIT License.