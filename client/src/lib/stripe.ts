export async function createSubscription(priceId: string) {
  const res = await fetch("/api/stripe/create-subscription", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ priceId }),
  });

  if (!res.ok) {
    throw new Error("Failed to create subscription");
  }

  return res.json();
}
