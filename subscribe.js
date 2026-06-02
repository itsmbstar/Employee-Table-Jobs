const emailjs = require('@emailjs/nodejs');

// ====== CONFIGURATION – Use the exact variable names you defined ======
const EMAILJS_PUBLIC_KEY  = 'AGZLYyuu8xzRuAi69';
const EMAILJS_SERVICE_ID  = 'service_yaqw81n';
const EMAILJS_TEMPLATE_ID = 'template_6kkqpce';
// ====================================================================

async function sendSubscriptionEmail(user) {
  const templateParams = {
    to_name: user.to_name,
    to_email: user.to_email,
    city: user.city,
  };

  try {
    const response = await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      templateParams,
      EMAILJS_PUBLIC_KEY
    );
    console.log('Email sent successfully:', response);
    return response;
  } catch (error) {
    console.error('Email send failed:', error);
    throw error;
  }
}

// Test when running directly
if (require.main === module) {
  const testUser = {
    to_name: 'John',
    to_email: 'test@example.com',
    city: 'Mumbai',
  };

  sendSubscriptionEmail(testUser)
    .then(() => console.log('Test email done'))
    .catch(() => console.log('Test email failed'));
}

module.exports = { sendSubscriptionEmail };