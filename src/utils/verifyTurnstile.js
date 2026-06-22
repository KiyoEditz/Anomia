const verifyTurnstileToken = async (token, clientIp) => {
  if (!token) return false;

  const formData = new URLSearchParams();
  formData.append('secret', process.env.TURNSTILE_SECRET_KEY);
  formData.append('response', token);
  if (clientIp) formData.append('remoteip', clientIp);

  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body: formData }
  );

  const result = await response.json();
  return result.success === true;
};

module.exports = { verifyTurnstileToken };
