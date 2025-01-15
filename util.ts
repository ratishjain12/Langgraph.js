export function parseFullName(fullName: string) {
  const nameParts = fullName.split(" ");
  const first_name = nameParts[0]; // Assuming first name is the first part
  const last_name = nameParts.slice(1).join(" "); // Everything else is considered the last name

  return { first_name, last_name };
}
