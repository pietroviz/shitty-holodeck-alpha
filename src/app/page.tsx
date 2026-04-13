export default function Home() {
  return (
    <iframe
      src="/holodeck/index.html"
      title="Shitty Holodeck"
      style={{
        width: "100%",
        height: "100vh",
        border: "none",
        display: "block",
      }}
      allowFullScreen
    />
  );
}
