// Shared rate limit handler to avoid code duplication
export const createRateLimitHandler = (setCooldown) => {
  return (data) => {
    setCooldown(data.retryAfter);
    let remaining = data.retryAfter;
    const interval = setInterval(() => {
      remaining -= 1;
      setCooldown(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);
  };
};
