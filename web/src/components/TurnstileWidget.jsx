import { Turnstile } from '@marsidev/react-turnstile';

const TurnstileWidget = ({ onSuccess, onError }) => {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  if (!siteKey) return null;

  return (
    <Turnstile
      siteKey={siteKey}
      onSuccess={onSuccess}
      onError={onError}
      options={{
        theme: 'dark',
        size: 'invisible',
      }}
    />
  );
};

export default TurnstileWidget;
