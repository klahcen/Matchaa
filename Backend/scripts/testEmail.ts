import { sendVerificationEmail } from '../src/services/emailService';

async function main() {
  // Use email passed as CLI argument, or default to Resend test email 'delivered@resend.dev'
  const recipient = process.argv[2] || process.env.TEST_EMAIL || 'delivered@resend.dev';
  console.log(`Sending test verification email to ${recipient}...`);

  try {
    await sendVerificationEmail(recipient, 'TestUser', 'test-token-12345');
    console.log('Test script completed.');
  } catch (err: any) {
    console.error('Test script caught error:', err.message || err);
  }
}

main();
