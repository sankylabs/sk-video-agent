export function DirectorSignOut() {
  return (
    <form className="director-signout" action="/api/events/director/logout" method="post">
      <button className="event-secondary" type="submit">
        Sign out
      </button>
    </form>
  );
}
