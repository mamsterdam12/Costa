export default function Footer() {
  return (
    <footer className="mt-16 border-t border-sea-100 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-sea-600">
        <p>
          &copy; {new Date().getFullYear()} Costa Community — de community voor
          huiseigenaren in Spanje.
        </p>
      </div>
    </footer>
  );
}
