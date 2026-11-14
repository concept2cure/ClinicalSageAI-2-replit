/**
 * The greeting, by one rule for the two pages that greet: Home (Surfaces.tsx) and
 * Tasks (TaskPageHeader.tsx). P-131 item 4: "The greeting is Home's (time of day
 * and first name), by the same rule. … It is now on Home and on Tasks."
 *
 * A first name, as Claude greets. An account that has only an email gets the
 * part before the @, never the whole address across the page.
 */
export interface GreetedUser {
  firstName?: string | null;
  displayName?: string | null;
}

/** "Good morning" before noon, "Good afternoon" before five, else "Good evening". */
export function timeOfDayGreeting(hour: number): string {
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

/** The name a greeting uses: the first name, else the display name, never an email address; "there" when none. */
export function greetingName(user: GreetedUser | null | undefined): string {
  const named = user?.firstName || user?.displayName || '';
  return (named.includes('@') ? named.split('@')[0] : named) || 'there';
}

/** "Good afternoon, Rae". */
export function greetingFor(user: GreetedUser | null | undefined, hour: number = new Date().getHours()): string {
  return `${timeOfDayGreeting(hour)}, ${greetingName(user)}`;
}
