export async function createSubscription(priceId: string, serverId?: number) {
  const res = await fetch("/api/stripe/create-subscription", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ priceId, serverId }),
    credentials: "include",
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to create subscription");
  }

  return res.json();
}

// Constants
export const SUBSCRIPTION_PRICE_ID = "price_1QsY8yP6DDFtG7MvtzQmVgyt";