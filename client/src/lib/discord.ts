export async function getAuthStatus() {
  const res = await fetch("/api/auth/user", {
    credentials: "include",
  });
  
  if (!res.ok) {
    return null;
  }
  
  return res.json();
}
