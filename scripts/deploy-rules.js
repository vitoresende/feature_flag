const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load .env from root of feature_flag
const envPath = path.resolve(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
  console.error("Error: .env file not found. Please create it or copy from .env.example.");
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const allowedEmailsMatch = envContent.match(/VITE_ALLOWED_EMAILS=["']?([^"'\n]+)["']?/);
if (!allowedEmailsMatch) {
  console.error("Error: VITE_ALLOWED_EMAILS not found in .env.");
  process.exit(1);
}

const emails = allowedEmailsMatch[1]
  .split(',')
  .map(email => email.trim().toLowerCase())
  .filter(email => email.length > 0);

if (emails.length === 0) {
  console.error("Error: No emails found in VITE_ALLOWED_EMAILS.");
  process.exit(1);
}

// Convert to CEL array format: ['email1@gmail.com', 'email2@gmail.com']
const celArray = '[' + emails.map(email => `'${email}'`).join(', ') + ']';

// Read firestore.rules.template
const templatePath = path.resolve(__dirname, '../firestore.rules.template');
if (!fs.existsSync(templatePath)) {
  console.error("Error: firestore.rules.template not found.");
  process.exit(1);
}

let rulesContent = fs.readFileSync(templatePath, 'utf8');
rulesContent = rulesContent.replace('ALLOWED_EMAILS_PLACEHOLDER', celArray);

// Write active rules file (which is gitignored)
const rulesPath = path.resolve(__dirname, '../firestore.rules');
fs.writeFileSync(rulesPath, rulesContent);
console.log(`[Firebase Rules] Compiled firestore.rules with whitelisted emails: ${emails.join(', ')}`);

// Run deployment via Firebase CLI, forwarding any CLI arguments passed to this script
try {
  console.log("[Firebase Rules] Deploying rules to Firestore...");
  const extraArgs = process.argv.slice(2).join(' ');
  execSync(`npx firebase-tools deploy --only firestore ${extraArgs}`, { stdio: 'inherit' });
  console.log("[Firebase Rules] Deploy completed successfully.");
} catch (err) {
  console.error("[Firebase Rules] Error deploying rules. Make sure firebase CLI is logged in.");
  process.exit(1);
}
