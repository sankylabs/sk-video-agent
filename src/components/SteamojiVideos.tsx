const SHOWCASE_VIDEOS = [
  {
    title: "Our Facilitator view",
    id: "buzU7Vo7WLI",
  },
  {
    title: "Member spotlight",
    id: "3Z1BQ4foqkM",
  },
  {
    title: "Member parent spotlight",
    id: "QM3M5WhvqHM",
  },
  {
    title: "Member parent spotlight",
    id: "Ip3aoz6flN4",
  },
] as const;

export function SteamojiVideos() {
  return (
    <section className="showcase-videos" aria-labelledby="showcase-videos-heading">
      <h2 id="showcase-videos-heading">See Steamoji Kirkland</h2>
      <p className="showcase-videos-lede">
        A look inside the academy — facilitators, members, and families.
      </p>
      <div className="showcase-videos-grid">
        {SHOWCASE_VIDEOS.map((video) => (
          <figure key={video.id} className="showcase-video-card">
            <figcaption>{video.title}</figcaption>
            <div className="showcase-video-frame">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${video.id}`}
                title={video.title}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </figure>
        ))}
      </div>
    </section>
  );
}
