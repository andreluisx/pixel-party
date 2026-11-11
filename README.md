# Pixel Party — Entrega 0 (Fundação + Laboratório de Minigames)

Jogo de tabuleiro multiplayer em pixel art, até 4 jogadores; vagas sem humano são bots.

## Como rodar

```bash
npm install
npm run dev          # servidor (porta 3001) + site (porta 3000)
```

Abra http://localhost:3000/dev/minigames

- Outra aba ou outro dispositivo na mesma rede: abra `http://IP-DO-SEU-PC:3000/dev/minigames` e entre com o código da sala.
- Se o servidor ficar em outro endereço: `NEXT_PUBLIC_SERVER_URL=http://host:3001 npm run dev:web`.

## Testes

```bash
npm test            # lógica: recompensas, determinismo, 100 partidas só com bots, dificuldade dos bots
npm run typecheck
npm run build
npm run dev:server  # em outro terminal
npm run smoke       # ponta a ponta contra o servidor real: 2 humanos + 2 bots, desconexão, recompensa única
```

## O que existe

| Parte | Onde |
|---|---|
| Tipos compartilhados cliente/servidor | `shared/types.ts`, `shared/protocol.ts` |
| Contrato de minigame | `shared/minigame.ts` |
| Simulação headless (testes e botão "só bots") | `shared/sim.ts` |
| Bots (dificuldade, personalidade, cérebro por minigame) | `shared/bots.ts`, `createBot` de cada minigame |
| Recompensas por ranking, com empate | `shared/rewards.ts` |
| Servidor autoritativo (tick 30 Hz, Socket.IO) | `server/` |
| Pipeline de arte (mapas de pixels + paleta única) | `src/game/art/` |
| Cena Phaser pixel-perfect (480x270, escala inteira) | `src/game/` |
| Áudio procedural (WebAudio) | `src/game/audio/sfx.ts` |
| Laboratório | `src/components/Lab.tsx` |

Novo minigame = um arquivo em `shared/minigames/`, uma linha em `shared/minigames/index.ts`, uma view em `src/game/views/`.

## Decisões e limitações conhecidas

- Phaser 3.90 (a especificação pede Phaser 3; o npm já oferece o 4 por padrão).
- `step()` do minigame muta o estado e o retorna (evita alocação a 30 Hz).
- HUD, contagem, instruções e resultado ficam em React sobre o canvas (nítidos em qualquer tela). Dentro do Phaser vai só o mundo.
- Sem predição no cliente: o próprio jogador espera o servidor (ok em rede local; predição entra se a latência incomodar).
- Os 4 personagens são provisórios (silhuetas por chapéu/cabelo, 12x16, 2 quadros). Os 6 finais com todas as animações vêm na Entrega 1.
- A "Arena de Teste" é provisória e será removida quando a Caça-Moedas oficial (Entrega 4) existir.
- Reconexão: a vaga é guardada na aba (sessionStorage). Se o humano cai durante o minigame, um bot assume; ao voltar com `lab:rejoin`, ele retoma.
- A fonte Pixelify Sans vem do Google Fonts; sem internet o jogo usa uma fonte monoespaçada.
