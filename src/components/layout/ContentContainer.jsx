export default function ContentContainer({ children }) {
  return (
    <main
      style={{
        flex: 1,
        width: "100%",
        minHeight: "100vh",
        minWidth: 0,
        background:
          "radial-gradient(circle at top right, rgba(191,219,254,0.45), transparent 28%), linear-gradient(180deg, #f8fbff 0%, #f6f8fc 100%)",
      }}
    >
      {children}
    </main>
  );
}
