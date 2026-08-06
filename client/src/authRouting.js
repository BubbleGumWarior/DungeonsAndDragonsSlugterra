export function landingPathFor(user) {
  if (!user) return "/login";
  if (user.mustChangePassword) return "/change-password";
  if (user.role !== "Dungeon Master" && user.status !== "approved") return "/request-access";
  return "/dashboard";
}
