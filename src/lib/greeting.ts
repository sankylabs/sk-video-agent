export const mayaGreeting = (lead?: { name?: string; childName?: string }) => {
  const who = lead?.name ? `Hi ${lead.name}!` : "Hi there!";
  const child = lead?.childName
    ? ` Excited you're checking out Steamoji Kirkland for ${lead.childName}.`
    : " Welcome to Steamoji Kirkland.";
  return `${who}${child} I'm Maya, an AI enrollment advisor at Steamoji Kirkland. We are a maker academy for kids ages 5-14 that equips children with the hands-on STEM skills and a maker mindsets to solve real-world problems. Want a quick walkthrough?`;
};
