import Link from 'next/link';

export default function Home() {
  return (
    <main className="home">
      <h1 className="logo">PIXEL<br />PARTY</h1>
      <p className="home-sub">Fundação pronta. O menu completo chega na Entrega 1.</p>
      <Link className="btn btn-gold" href="/dev/minigames">Abrir laboratório de minigames</Link>
    </main>
  );
}
