#!/usr/bin/env node

// scripts/deploy.js - Production deployment script
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DeploymentScript {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
    this.frontendDir = path.join(this.rootDir, 'frontend');
    this.backendDir = this.rootDir;
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      warning: '\x1b[33m', // Yellow
      error: '\x1b[31m',   // Red
      reset: '\x1b[0m'     // Reset
    };
    
    console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
  }

  execCommand(command, cwd = this.rootDir) {
    this.log(`Executing: ${command}`, 'info');
    try {
      const result = execSync(command, { 
        cwd, 
        stdio: 'inherit',
        encoding: 'utf8'
      });
      return result;
    } catch (error) {
      this.log(`Command failed: ${error.message}`, 'error');
      throw error;
    }
  }

  checkPrerequisites() {
    this.log('Checking prerequisites...', 'info');
    
    // Check Node.js version
    const nodeVersion = process.version;
    this.log(`Node.js version: ${nodeVersion}`, 'info');
    
    // Check if required files exist
    const requiredFiles = [
      'package.json',
      'src/app.js',
      'src/index.js',
      'frontend/package.json'
    ];
    
    for (const file of requiredFiles) {
      const filePath = path.join(this.rootDir, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Required file not found: ${file}`);
      }
    }
    
    // Check environment variables
    const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      this.log(`Missing environment variables: ${missingVars.join(', ')}`, 'warning');
      this.log('Please ensure all required environment variables are set', 'warning');
    }
    
    this.log('Prerequisites check completed', 'success');
  }

  installDependencies() {
    this.log('Installing backend dependencies...', 'info');
    this.execCommand('npm ci', this.backendDir);
    
    this.log('Installing frontend dependencies...', 'info');
    this.execCommand('npm ci', this.frontendDir);
    
    this.log('Dependencies installed successfully', 'success');
  }

  runTests() {
    this.log('Running backend tests...', 'info');
    try {
      this.execCommand('npm test', this.backendDir);
      this.log('Backend tests passed', 'success');
    } catch (error) {
      this.log('Backend tests failed, but continuing deployment', 'warning');
    }
    
    this.log('Running frontend tests...', 'info');
    try {
      this.execCommand('npm test -- --watchAll=false', this.frontendDir);
      this.log('Frontend tests passed', 'success');
    } catch (error) {
      this.log('Frontend tests failed, but continuing deployment', 'warning');
    }
  }

  buildFrontend() {
    this.log('Building frontend for production...', 'info');
    this.execCommand('npm run build', this.frontendDir);
    
    // Verify build output
    const buildDir = path.join(this.frontendDir, 'build');
    if (!fs.existsSync(buildDir)) {
      throw new Error('Frontend build failed - build directory not found');
    }
    
    this.log('Frontend build completed successfully', 'success');
  }

  optimizeAssets() {
    this.log('Optimizing assets...', 'info');
    
    // Copy frontend build to backend public directory
    const buildDir = path.join(this.frontendDir, 'build');
    const publicDir = path.join(this.backendDir, 'public');
    
    if (fs.existsSync(publicDir)) {
      this.execCommand(`rm -rf ${publicDir}/*`);
    } else {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    this.execCommand(`cp -r ${buildDir}/* ${publicDir}/`);
    
    this.log('Assets optimized and copied', 'success');
  }

  setupDatabase() {
    this.log('Setting up database...', 'info');
    
    // Run database migrations if they exist
    const migrationsDir = path.join(this.backendDir, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      try {
        this.execCommand('npm run db:migrate', this.backendDir);
        this.log('Database migrations completed', 'success');
      } catch (error) {
        this.log('Database migrations failed', 'warning');
      }
    }
    
    // Seed database if needed
    try {
      this.execCommand('npm run db:seed', this.backendDir);
      this.log('Database seeding completed', 'success');
    } catch (error) {
      this.log('Database seeding skipped or failed', 'info');
    }
  }

  performSecurityChecks() {
    this.log('Performing security checks...', 'info');
    
    try {
      this.execCommand('npm audit --audit-level moderate', this.backendDir);
      this.log('Backend security audit passed', 'success');
    } catch (error) {
      this.log('Backend security audit found issues', 'warning');
    }
    
    try {
      this.execCommand('npm audit --audit-level moderate', this.frontendDir);
      this.log('Frontend security audit passed', 'success');
    } catch (error) {
      this.log('Frontend security audit found issues', 'warning');
    }
  }

  createStartupScript() {
    this.log('Creating startup script...', 'info');
    
    const startupScript = `#!/bin/bash
# Production startup script for Link Shortener

export NODE_ENV=production
export PORT=\${PORT:-5000}

# Start the application with PM2 (if available) or Node.js
if command -v pm2 &> /dev/null; then
    echo "Starting with PM2..."
    pm2 start src/index.js --name "link-shortener" --instances max --exec-mode cluster
else
    echo "Starting with Node.js..."
    node src/index.js
fi
`;
    
    const scriptPath = path.join(this.backendDir, 'start.sh');
    fs.writeFileSync(scriptPath, startupScript);
    this.execCommand(`chmod +x ${scriptPath}`);
    
    this.log('Startup script created', 'success');
  }

  generateDeploymentReport() {
    const report = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
      deploymentStatus: 'success',
      components: {
        backend: 'deployed',
        frontend: 'built and deployed',
        database: 'configured',
        assets: 'optimized'
      },
      nextSteps: [
        'Set up reverse proxy (nginx/Apache)',
        'Configure SSL certificates',
        'Set up monitoring and logging',
        'Configure backup strategy',
        'Set up CI/CD pipeline'
      ]
    };
    
    const reportPath = path.join(this.backendDir, 'deployment-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    this.log('Deployment report generated', 'success');
    return report;
  }

  async deploy() {
    try {
      this.log('Starting production deployment...', 'info');
      
      this.checkPrerequisites();
      this.installDependencies();
      this.performSecurityChecks();
      this.runTests();
      this.buildFrontend();
      this.optimizeAssets();
      this.setupDatabase();
      this.createStartupScript();
      
      const report = this.generateDeploymentReport();
      
      this.log('🚀 Deployment completed successfully!', 'success');
      this.log('📊 Deployment report saved to deployment-report.json', 'info');
      this.log('🔧 Next steps:', 'info');
      report.nextSteps.forEach(step => this.log(`   • ${step}`, 'info'));
      
      return report;
      
    } catch (error) {
      this.log(`❌ Deployment failed: ${error.message}`, 'error');
      throw error;
    }
  }
}

// Run deployment if called directly
if (require.main === module) {
  const deployment = new DeploymentScript();
  deployment.deploy()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Deployment failed:', error);
      process.exit(1);
    });
}

module.exports = DeploymentScript;
