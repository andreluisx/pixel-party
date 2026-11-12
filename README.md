<<<<<<< HEAD
# Pixel Party — Entrega 3 (Reflexo Relâmpago) sobre as Entregas 0, 1 e 2
=======
# Pixel Party — Entrega 1 (Menu, salas e lobby de 4 jogadores) sobre a Entrega 0
>>>>>>> 89dd3df16bc6020c7711e0f3b84fc20dd55f6ec5

Jogo de tabuleiro multiplayer em pixel art, até 4 jogadores; vagas sem humano são bots.

## Como rodar

```bash
npm install
npm run dev          # servidor (porta 3001) + site (porta 3000)
```

- Jogo: http://localhost:3000/ (menu, criar/entrar por código, lobby, personagens, configurações)
- Laboratório de minigames: http://localhost:3000/dev/minigames

- Outra aba ou outro dispositivo na mesma rede: abra `http://IP-DO-SEU-PC:3000/dev/minigames` e entre com o código da sala.
- Se o servidor ficar em outro endereço: `NEXT_PUBLIC_SERVER_URL=http://host:3001 npm run dev:web`.

## Testes

```bash
npm test            # lógica: recompensas, determinismo, 100 partidas só com bots, dificuldade dos bots
npm run typecheck
npm run build
npm run dev:server  # em outro terminal
npm run smoke       # laboratório: 2 humanos + 2 bots, desconexão, recompensa única
npm run smoke:room  # lobby: 4 humanos, sala cheia, personagens únicos, queda/retorno, host migra
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

<<<<<<< HEAD
## Entrega 3: Reflexo Relâmpago (`reflexo-relampago`)

Teste em `/dev/minigames` escolhendo "Reflexo Relâmpago" na lista.

- 25 s. Cada jogador tem seu painel; a **mesma seta** aparece para os 4 ao mesmo tempo. Aperte a direção igual (← ↑ ↓ → ou A W S D; no celular, 4 botões na tela).
- Pontos: 10 base + até 10 por rapidez + bônus de sequência (até +5). Seta **dourada** vale o dobro e some mais rápido.
- Errar a seta, apertar sem seta ou apertar de novo na mesma seta: **trava 0,7 s** e perde 3 pontos. Apertar logo depois da seta sumir não é erro (150 ms de carência).
- Intervalos **imprevisíveis** (sorteados ao vivo no servidor, cada intervalo independente) e a janela de resposta encolhe de 1,1 s para 0,5 s. Nunca 3 setas iguais seguidas.
- O gerador aleatório **não é enviado aos clientes** (`publicState`), então ninguém consegue prever as próximas setas.
- Ranking por pontos; desempate pela soma dos tempos de reação (quem reagiu mais rápido vence). Recompensa 8/6/4/3.
- Bots: tempo de reação médio de 560 ms (fácil), 400 ms (médio) e 280 ms (difícil), com chance de errar a tecla e de deixar passar.
- Novidades de base: fonte de números em pixel (`src/game/views/pixelNumber.ts`), controles de toque em cruz (`DPad`) e apertos de tecla por evento (toques rápidos não se perdem).
- **Correção importante**: nas Entregas 0 a 2, o laboratório cancelava o evento das setas e do espaço antes de o Phaser vê-lo, então só WASD funcionava (setas e Espaço eram ignorados). Agora o Phaser captura essas teclas só durante a partida.
- Testes: `tests/reflexo.test.ts` (15 testes).

## Entrega 2: Corrida Maluca (`corrida-maluca`)

Teste em `/dev/minigames` (o minigame já vem selecionado). Crie a sala, abra outras abas para mais humanos; o resto vira bot.

- 4 pistas paralelas idênticas (mesma seed), 2.500 px, câmera própria por pista.
- Controles: **Espaço / ↑ / W** pula (segure para pular mais alto; é preciso apertar de novo para cada pulo), **→ / D** corre mais rápido, **← / A** freia. No celular: joystick + botão PULAR.
- Obstáculos: caixas (batida = tropeço e perde velocidade), buracos (cai, reaparece antes dele depois de ~1 s), plataformas, buraco largo com degrau, e o **atalho da mola**, que lança por cima de um trecho cheio de caixas.
- Moedas dão impulso de velocidade. A pista fica mais difícil conforme avança.
- Vence quem cruza a linha primeiro; os demais têm mais 6 s. Quem não chega é ordenado pela distância. Recompensa 8/6/4/3 (empate divide).
- Tudo é simulado no servidor (30 Hz). O cliente só envia `{run, jump}`.
- Bots: fácil erra o tempo do pulo e não acelera, médio acelera nos buracos largos, difícil acelera sempre. A mola é escolhida por probabilidade (10% / 50% / 90%).
- Personagens ganharam as animações de correr, pular e cair (veja em Personagens).
- Testes: `tests/corrida.test.ts` (pista, física, pulo por borda, mola, queda, 100 corridas só com bots, dificuldade).

=======
>>>>>>> 89dd3df16bc6020c7711e0f3b84fc20dd55f6ec5
## Entrega 1: o que mudou

- Menu animado (céu, nuvens, castelo, água, ilha, vaga-lumes), com música chiptune original e sons.
- Criar sala / entrar por código; lobby com 4 vagas. Vaga sem humano = bot (host escolhe a dificuldade de cada bot).
- 6 personagens com silhuetas diferentes e animações: espera, caminhada, comemoração, derrota e surpresa. Únicos por sala.
- Pronto/iniciar: só começa com todos os humanos conectados e prontos. Não-host não inicia.
- Queda de conexão: a vaga fica guardada por 30 s no lobby; ao recarregar a página a vaga é retomada. Host sai: outro humano vira host.
- Configurações: volume de música e efeitos, silenciar, reduzir animações (salvas no navegador).
- Lógica pura do lobby em `shared/lobby.ts`; sala no servidor em `server/gameRoom.ts`; telas em `src/components/GameApp.tsx`.
- Ao iniciar, aparece uma tela provisória "Partida iniciada" (o tabuleiro jogável vem na Entrega 10).

## Decisões e limitações conhecidas

- Phaser 3.90 (a especificação pede Phaser 3; o npm já oferece o 4 por padrão).
- `step()` do minigame muta o estado e o retorna (evita alocação a 30 Hz).
- HUD, contagem, instruções e resultado ficam em React sobre o canvas (nítidos em qualquer tela). Dentro do Phaser vai só o mundo.
- Sem predição no cliente: o próprio jogador espera o servidor (ok em rede local; predição entra se a latência incomodar).
- Personagens: correr, pular e cair (usados nos minigames) entram junto com cada minigame.
- A "Arena de Teste" é provisória e será removida quando a Caça-Moedas oficial (Entrega 4) existir.
- Reconexão: a vaga é guardada na aba (sessionStorage). Se o humano cai durante o minigame, um bot assume; ao voltar com `lab:rejoin`, ele retoma.
- A fonte Pixelify Sans vem do Google Fonts; sem internet o jogo usa uma fonte monoespaçada.
