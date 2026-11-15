# Pixel Party — Entrega 11 (Economia, itens, lojas e eventos) sobre as Entregas 0 a 10

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

## Entrega 7.1: ajustes no Duelo de Arqueiros

1. **Flechas e laterais.** Os arqueiros continuam atravessando as laterais, mas as flechas **cravam na borda** (não voltam do outro lado). Mira do mouse, mira assistida (F), linha de pré-visualização e bots passaram a usar distância direta; a linha pontilhada termina na borda; flecha não acerta quem está do outro lado.
2. **Power-ups.** 13 pontos de surgimento sobre piso fixo, em 5 andares (nenhum no buraco). Regras: **distância mínima de 70 px entre itens** (nunca dois no mesmo lugar), os **5 últimos pontos usados não se repetem**, preferência por **trocar de andar** e por pontos longe dos outros itens, e o mesmo tipo seguido é menos provável. Se não houver ponto livre, o item espera 0,8 s e tenta de novo.
3. **Nascimento inicial.** Duas formações (cantos do chão + plataformas de cima), sorteadas pela seed, com os jogadores embaralhados entre os pontos. Distância mínima entre dois jogadores: **124 px** (antes ~43 px; teste exige ≥ 110 px em 80 seeds). Os reaparecimentos já escolhiam o ponto mais longe dos inimigos e agora também usam a lista nova.
4. **Estatísticas.** Por arqueiro: **abates**, **acertos dados** (e precisão), acertos recebidos, **quem acertou por último** (`lastHitBy`), tiros e pontos de destaque; o estado também guarda o **registro dos últimos acertos** e o **ÚLTIMO HIT** da partida. No jogo: cartões maiores (caveira = abates, alvo = acertos, número dourado = pontos), registro "A - B" / "A X B" à esquerda, "+10 / +25 / +35" sobre o atirador e banner **ÚLTIMO HIT!** com flash. Na tela de resultado: linha de estatísticas por jogador.
   - **Pontos de destaque:** acerto +10, abate +15, **último hit +10**. O **último hit** é o abate que deixa no máximo um arqueiro vivo (decide a partida). Só nesse caso há bônus de **+1 moeda** (a tabela é 8/6/4/3, então vale ~12% do prêmio do 1º lugar).
   - **Balanceamento:** os pontos de destaque e o bônus **não mudam a colocação nem desfazem empates** (a regra original continua: mais vidas / quem caiu depois; iguais dividem). Em partidas de bots o último hit acontece em ~96% dos jogos (quase sempre do vencedor), então na prática é um pequeno prêmio por fechar a partida. Se o tempo acabar sem decisão, não há último hit nem bônus.
5. **Buraco no centro (x 208–272, 64 px).** Quem passa do meio do buraco cai (a quina é segura: 3 px de tolerância), desce pelo poço até sair da tela e **reaparece no topo**, caindo no centro (x 218–262) até pousar na plataforma de cima, com **0,7 s de invulnerabilidade** e **sem perder vida**. As paredes do poço seguram dos lados. Dá para pular o buraco correndo (58 px em ~0,52 s). Flechas passam sobre o buraco e continuam caindo. Visual: poço escuro com setas descendo, brilho azul no fundo e portal brilhando no topo, efeitos e sons ao cair e ao reaparecer. Bots: pulam o buraco correndo; bots com 1 vida e pressionados às vezes mergulham de propósito para fugir (cerca de 2 passagens por partida de bots).

Testes novos em `tests/duelo-arqueiros.test.ts` (agora 42): flechas na borda (nos 2 lados), surgimento de itens (60 seeds, distância mínima, variação, ocupação total), distância inicial (80 seeds), estatísticas, último hit, bônus e empates, e o buraco (queda, retorno, invulnerabilidade, paredes, flechas). `MinigameResult` ganhou `bonus?` e `details?` (opcionais; os outros minigames não mudam).

## Entrega 7: Duelo de Arqueiros (`duelo-arqueiros`) — ocupa o lugar da Arena Explosiva

- 45 s, 4 arqueiros todos contra todos, **3 vidas** cada (máx. 4). Arena de plataforma 480x270 com **continuidade horizontal para os arqueiros**: quem sai por um lado reaparece no outro (aparece "dos dois lados" perto da borda). **As flechas não atravessam** (ver Entrega 7.1).
- **Controles:** WASD/setas andam (**Shift** corre), **Espaço / W / ↑** pula (segure para pular mais alto; tem tolerância ao pular na borda da plataforma). **Mouse** mira e **clique** atira. **F** (ou botão **ATIRAR** no celular) atira com **mira assistida** no inimigo mais próximo, já compensando a queda da flecha. No celular: joystick (andar; no máximo, corre), botão PULAR e botão ATIRAR; toque na tela também mira e atira.
- **Flechas:** saem quase retas e caem com a gravidade (a mesma fórmula serve para a linha pontilhada de pré-visualização da sua mira e para os bots). Cooldown de 0,5 s. Cada acerto tira 1 vida; quem é atingido reaparece **longe dos inimigos** com 1,5 s de invulnerabilidade (a flecha passa direto por quem está invulnerável).
- **Power-ups** (aparecem a cada ~4 s, no máx. 3, somem em 12 s): **flecha tripla** (3 cargas, leque de 3 flechas), **flecha flamejante** (3 cargas: atravessa vários jogadores, quebra o escudo e destrói plataformas/pilares), **escudo** (absorve 1 disparo), **vida extra** (+1, até 3) e **botas** (8 s de velocidade e pulo maiores).
- **Plataformas e pilares que aparecem e somem:** 5 plataformas finas e 3 pilares de pedra. Ciclo: some → **pisca avisando** (ainda sem colisão) → sólida → pisca (ainda sólida) → some. Pilar nunca esmaga: quem fica dentro é empurrado para o lado.
- **Servidor autoritativo** (30 Hz): movimento, pulo, mira, disparos, trajetórias (4 sub-passos por tick, nada atravessa um arqueiro), acertos, escudos, vidas, itens e ciclo dos pilares.
- **Vitória:** último vivo vence (a partida termina 1,4 s depois). Fim do tempo: **mais vidas** vence; **mesmas vidas dividem a vitória** (empate). Eliminados ficam por ordem de eliminação (quem caiu depois é melhor; mesmo instante empata). Recompensa 8/6/4/3 com empate dividindo.
- **Bots:** usam a mesma física e o mesmo cálculo de mira. Fácil mira com erro grande e reage devagar, médio antecipa o movimento do alvo e desvia de flechas, difícil erra pouco, reage rápido e busca itens úteis.
- Arte: cenário de pôr do sol com floresta (nuvens e vaga-lumes animados), tochas nos pilares, rastro de fogo, efeitos de acerto/eliminação/item. Testes: `tests/duelo-arqueiros.test.ts` (42, contando os da 7.1).

## Entrega 6: Quebra-Cabeça Relâmpago (`quebra-cabeca`)

- 45 s. Todos recebem a **mesma imagem** em pixel art (6 imagens: castelo, ilha, foguete, robô, vulcão, aquário, sorteada pela seed) em **16 peças (4x4)**, **embaralhadas do mesmo jeito** (mínimo 13 peças fora do lugar).
- **Controles:** clique ou toque em uma peça e depois em outra para trocar. No teclado: setas escolhem, Espaço/Enter pega e solta. Selecionar a mesma peça de novo cancela.
- Tela: seu tabuleiro grande, o **modelo** (imagem pronta) e os **tabuleiros dos 3 adversários ao vivo**. Peças no lugar certo ganham um selo verde; contador "N/16" e número de trocas.
- **Servidor autoritativo:** cada jogador tem o tabuleiro no servidor. O cliente só pede "trocar a posição a com b". O servidor valida (índices, mesma posição, intervalo mínimo de 90 ms entre trocas) e decide quando alguém completou. Cada jogador só mexe no próprio tabuleiro.
- **Vitória:** quem termina primeiro vence; os outros têm mais 6 s e depois valem pelas **peças certas**. Quem não termina ordena por peças certas; mesmo desempenho = empate. Recompensa 8/6/4/3. Resultado mostra o tempo ("5,0 s") ou "N/16 peças".
- **Bots:** resolvem colocando a peça certa em uma posição errada a cada jogada. Fácil ~3,3 s por jogada (termina em cerca de 19% das partidas), médio ~2,1 s (85%, média de 28 s), difícil ~1,35 s (99%, média de 18 s). Erram de vez em quando e nunca olham o tabuleiro dos outros.
- Testes: `tests/quebra-cabeca.test.ts` (15). Arte: `src/game/art/puzzles.ts`.

## Entrega 5: Último Disparo (`ultimo-disparo`) — ocupa o lugar do antigo "Memória de Pixel"

Arena 16x10 vista de cima, com pilares. Cada rodada: **intro/fechamento** (a arena fecha um anel e empurra quem estava na borda, ninguém é eliminado por isso) → **POSICIONAMENTO** (todos invisíveis, andam e escolhem a direção do tiro; tempo cai de 9,5 s para 5 s) → **REVELAÇÃO** (movimentos travados, todos aparecem ao mesmo tempo com a linha de tiro à mostra) → **DISPAROS** (simultâneos, em linha reta, atravessam jogadores, param em pilares e bordas) → **RESULTADO**.

- **Controles:** setas/WASD movem. O botão **MODO MOVER / MODO MIRA** (ou tecla **E** / **Espaço**, ou o botão na tela no celular) alterna: no modo mira o personagem **para** e as setas só giram a mira nas **8 direções** (4 retas + 4 diagonais, vetores normalizados, sem distorção). A mira escolhida fica até o disparo. Há linha tracejada de pré-visualização (só da sua mira, ela não mostra inimigos), mira em cruz e o botão muda de cor (verde/vermelho) e de texto. Fora do posicionamento o botão fica **TRAVADO**.
- **Invisibilidade de verdade:** o servidor envia a cada jogador **só a própria posição** durante o posicionamento (`viewFor`); os outros chegam como "escondidos". Ninguém consegue ver os adversários pelo navegador. O servidor continua registrando posição e mira de todos.
- **Servidor autoritativo:** fases, posições, mira, trajetórias, quem é atingido e a redução da arena. Todos recebem as mesmas trajetórias e o mesmo resultado (testado com 2 humanos reais: `npm run smoke:duel`).
- **Disparos:** todos atiram ao mesmo tempo, inclusive quem é atingido na mesma rodada (eliminação mútua). Um tiro pode eliminar vários na mesma linha.
- **Arena que diminui:** um anel por rodada, até 10x4 na rodada 4; pilares só existem dentro da arena final. Faixas de perigo animadas, aviso piscando antes de fechar.
- **Pontuação e empate:** vence o último de pé. Colocação = (sobreviveu > caiu em rodada mais tarde) e, dentro disso, **mais abates**. Quem tem o **mesmo desempenho empata** (mesma colocação) e a recompensa 8/6/4/3 é dividida na média. Casos cobertos por teste: dois se eliminando juntos, todos eliminados juntos, vários vivos na rodada 6, mesmo número de abates.
- **Bots:** só enxergam o que já foi revelado (um teste coloca uma armadilha que lança erro se o bot ler a posição de um invisível). Fácil escolhe posição e mira quase ao acaso; médio prefere cantos e a linha mais longa; difícil estima onde os adversários vão se esconder e mira nessas linhas. **Este é um jogo de adivinhação:** a dificuldade dos bots muda o comportamento, mas pouco o resultado.
- Testes: `tests/ultimo-disparo.test.ts` (30) e `tests/smoke-duel.ts`.

## Entrega 4: Caça-Moedas (`caca-moedas`) e Piso de LED (`piso-led`)

**Caça-Moedas** (antiga "Arena de Teste", agora minigame oficial como os outros): 40 s, arena vista de cima, moedas comuns (1) e douradas grandes (3), pedras que bloqueiam, **Bota Veloz** (5 s de +45% de velocidade, aparece a cada ~8 s), bots por dificuldade, animações de correr/comemorar/perder e joystick no celular. Id mudou de `pipeline-test` para `caca-moedas`.

**Piso de LED** (substitui o "Chão Perigoso" da especificação; 4 participantes):
- Arena de 10x6 placas de LED com 4 cores (5 a partir da rodada 3). Cada cor também tem uma **forma** (triângulo, círculo, quadrado, losango, cruz) para não depender só da cor.
- Cada rodada: faixa "RODADA N" → o chão acende **3 configurações** (com um apagão curto entre elas) → **só a última vale** → tudo apaga (apagão com suspense) → o **telão anuncia uma cor** → todos correm no escuro → quando o tempo acaba, quem está sobre uma placa da cor anunciada **na última configuração** sobrevive; os outros são eliminados (viram "fantasmas" e não participam mais).
- Dá para se mexer em todas as fases, menos no julgamento: dá para se posicionar durante as luzes.
- Rodadas ficam mais difíceis: luzes mais curtas (1,65 s → 0,85 s), menos tempo para correr (3,6 s → 2,2 s) e menos placas certas (12-16 na rodada 1, 5-7 na rodada 7). A configuração final sempre tem pelo menos 5 placas da cor anunciada.
- Vitória: último de pé. Se os últimos caem juntos = **empate** entre eles; se chegar à rodada 7 com vários vivos = empate no topo. Quem caiu em rodada posterior fica melhor colocado; quem caiu junto empata. Recompensa 8/6/4/3 (empate divide).
- O servidor guarda as 3 configurações e a cor; os clientes só recebem o que já foi aceso e a cor só depois do anúncio (`publicState`). Os bots só enxergam o que está aceso e **lembram imperfeitamente** (55% / 78% / 93% de acerto por placa), e reagem em 650 / 380 / 160 ms. Um teste garante que o cérebro do bot não lê o estado escondido.
- Testes: `tests/piso-led.test.ts` (16) e `tests/minigame.test.ts` (Caça-Moedas).

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

## Entrega 19: Futebol de Botão (`futebol-botao`) — categoria cooperação

Teste em `/dev/minigames` (agora o laboratório abre com o último minigame criado selecionado).

- **Duplas:** os 4 jogadores são sorteados pela seed em AZUL (defende o gol da esquerda) e VERMELHO. Cada um controla uma peça. A vez alterna entre as equipes e, dentro da dupla, entre os parceiros. Depois de um gol, quem levou o gol joga primeiro.
- **Sua jogada (até 5,5 s; estourou, a peça sai sozinha com força média):** aponte, **segure FORÇA** (Espaço, Enter ou botão na tela) e **solte** para lançar. A barra de força **sobe e desce sem parar** (um ciclo a cada 1,3 s), então dá para escolher o momento. Segurar o botão desde antes do turno não dispara sozinho.
- **Direção:** mouse/toque (segure e arraste no campo: a seta aponta para o ponteiro), **← → / A D** giram a mira, **↑ / W** aponta para a bola e **↓ / S** para o gol adversário. A seta muda de tamanho e de cor (verde → amarelo → vermelho) com a força, e todos veem a seta e a barra de quem está jogando.
- **Física:** círculos com atrito, colisões peça×peça e peça×bola (bola leve, ganha mais velocidade), quicadas nas bordas, traves e goleiros. A bola rola ~2 s. Peças não entram no gol.
- **Goleiros:** um por gol, vão e voltam sozinhos dentro das traves (movimento senoidal previsível), defendem com a física da bola.
- **Gols:** cada gol soma 1 ponto para a dupla. Gol contra vale para o adversário. Depois do gol: comemoração ("GOL!", confete, tremor), campo reinicia.
- **Tempo e fim:** a partida tem **2 minutos**, mas **quem fizer 2 gols primeiro vence na hora**: depois da comemoração ("VITÓRIA!") o jogo acaba. Se o tempo acabar, vence quem tem mais gols (empate fica empatado); a jogada em andamento termina antes (máx. +5 s). Constantes `DURATION_MS` e `GOALS_TO_WIN`.
- **Vitória:** 2 gols primeiro, ou mais gols no tempo; os dois da dupla recebem a mesma colocação (vencedores 7 moedas cada, perdedores 3 cada) e **+1 moeda por gol marcado** (bônus). Empate: todos dividem (5 cada).
- **Multiplayer:** o servidor decide tudo (turno, força, física, gols). O cliente só envia `{turn, aim, snap, charge}`; o input de quem não tem a vez é ignorado.
- **Bots:** testam jogadas na mesma física antes de chutar (mira na bola por trás na linha de um ponto do gol + variações), com erro de pontaria e reação por dificuldade. Em 30 partidas (4 bots): fácil ~0,5 gol/jogo, médio ~1,1, difícil ~2,0.
- Arquivos: `shared/minigames/futebol-botao.ts`, `src/game/views/FutebolView.ts`, `src/game/art/futebolArt.ts`, `src/game/MinigameScene.ts`, `shared/minigames/index.ts`, `tests/futebol-botao.test.ts` (19 testes).

## Entrega 18: Corrida Maluca mais clara (pássaro, túnel, pista por estruturas)

- **Nunca mais trava:** depois de uma batida (caixa, túnel, barril, pássaro) o corredor fica ~1,1 s "fantasma" (piscando) e **atravessa** o obstáculo. Teste: parado em pé contra o túnel por 4 s, ele acaba passando.
- **Túnel baixo (substitui a barra):** muro de pedra do céu até 9 px do chão, com abertura escura e borda amarela/preta embaixo e uma **seta amarela para baixo** pintada no muro. Não adianta pular (o muro vai até o céu). O corredor passa por trás do muro quando abaixado.
- **Placas claras:** laranja com seta grande para baixo e o texto **ABAIXE** antes de cada túnel; azul com seta grande para cima e o texto **PULE** antes de cada buraco, lama e das duas primeiras caixas.
- **Pássaro (para todos):** ao passar de um ponto da pista (mesmo ponto para todos), um pássaro nasce fora da tela e voa contra o corredor **na altura da cabeça** (faixa 8–15 px). Em pé: leva a batida. **Abaixado: passa por baixo.** **Pulando na hora certa (pés acima de 15 px quando ele cruza): passa por cima.** Cedo ou tarde demais: bate. Um "!" vermelho avisa na borda da tela enquanto ele não aparece. Dica na primeira vez ("PÁSSARO! ABAIXE (ou pule na hora)").
- **Pista por estruturas prontas ("prefabs"):** cada estrutura tem faixa da pista onde pode aparecer, peso e custo de dificuldade; a seed sorteia. Regras: sem perigo igual duas vezes seguidas, sem duas estruturas difíceis seguidas (custo somado ≤ 4), sem duas de abaixar seguidas, pássaro com trecho livre de 210 px só dele, espaço para pousar entre estruturas, caixa "?" a cada ~430 px, e os primeiros trechos ensinam na ordem: caixa, túnel, pássaro, seta, lama, caixa "?", buraco. Testado em 200 seeds.
- **Bots:** abaixam para o pássaro (erram conforme a dificuldade). Em 40 seeds: difícil termina ~97% (mediana ~19,5 s), médio ~93% (~23,6 s), fácil ~75% (~24,3 s).
- Arquivos: `shared/minigames/corrida-maluca.ts`, `src/game/views/CorridaView.ts`, `src/game/art/corridaArt.ts`, `tests/corrida.test.ts` (24 testes).

## Entrega 17: Corrida Maluca turbinada

Teste em `/dev/minigames` (o minigame já vem selecionado).

- **Abaixar (↓ / S; no celular, joystick para baixo):** barras listradas penduradas na pista só passam abaixado. Em pé ou pulando você bate (tropeça). Abaixado você anda um pouco mais devagar, e há moedas embaixo das barras. No ar, apertar ↓ faz cair mais rápido.
- **Lama:** deixa lento (metade da velocidade) enquanto você pisa; pule por cima.
- **Setas de impulso:** pisar dá turbo de ~1 s, sem apertar nada.
- **Caixa "?":** pegue andando ou pulando; o item é usado na hora (funciona no celular, que só tem um botão): **turbo forte**, **escudo** (absorve a próxima batida; bolha azul) ou **ataque** (um barril aparece na pista do rival mais próximo à frente, com placa vermelha de aviso). Quem está na frente tende a ganhar escudo; quem está atrás, turbo ou ataque. Sorteio determinístico (hash da seed), sem estado novo no cliente.
- **Clareza para quem joga pela primeira vez:** os primeiros trechos ensinam uma mecânica por vez (caixa, barra, seta, lama, caixa "?", buraco); placa amarela antes de cada barra; dica na tela só na primeira ocorrência de cada coisa ("ABAIXE! Tecla ↓ ou S"); aviso flutuante ao pegar itens; posição 1º–4º em cada pista; linhas de velocidade no turbo; tela de instruções atualizada.
- **Novos trechos:** barras duplas, abaixar-e-pular, seta + buraco, lama + caixa. Sempre há uma caixa "?" a cada ~430 px.
- **Bots:** abaixam nas barras (erram com a taxa de erro da dificuldade), desviam de barris, evitam lama (fácil nunca, médio 40%, difícil 85%). Quem levou a batida deixa de ignorar o perigo. Em 40 seeds: difícil termina ~93% (mediana ~19,7 s), médio ~73% (~23,8 s), fácil ~40% (~24,6 s).
- Protocolo: o input agora é `{run, jump, duck?}` (`duck` opcional, padrão falso). O servidor continua autoritativo.
- Arquivos: `shared/minigames/corrida-maluca.ts`, `src/game/views/CorridaView.ts`, `src/game/art/corridaArt.ts` (novo), `src/game/MinigameScene.ts`, `tests/corrida.test.ts` (20 testes, 7 novos).

## Entrega 2: Corrida Maluca (`corrida-maluca`)

Teste em `/dev/minigames` (o minigame já vem selecionado). Crie a sala, abra outras abas para mais humanos; o resto vira bot.

- 4 pistas paralelas idênticas (mesma seed), 2.500 px, câmera própria por pista.
- Controles: **Espaço / ↑ / W** pula (segure para pular mais alto; é preciso apertar de novo para cada pulo), **→ / D** corre mais rápido, **← / A** freia. No celular: joystick + botão PULAR.
- Obstáculos: caixas (batida = tropeço e perde velocidade), buracos (cai, reaparece antes dele depois de ~1 s), plataformas, buraco largo com degrau, e o **atalho da mola**, que lança por cima de um trecho cheio de caixas.
- Moedas dão impulso de velocidade. A pista fica mais difícil conforme avança.
- Vence quem cruza a linha primeiro; os demais têm mais 6 s. Quem não chega é ordenado pela distância. Recompensa 8/6/4/3 (empate divide).
- Tudo é simulado no servidor (30 Hz). O cliente só envia `{run, jump, duck}`.
- Bots: fácil erra o tempo do pulo e não acelera, médio acelera nos buracos largos, difícil acelera sempre. A mola é escolhida por probabilidade (10% / 50% / 90%).
- Personagens ganharam as animações de correr, pular e cair (veja em Personagens).
- Testes: `tests/corrida.test.ts` (pista, física, pulo por borda, mola, queda, 100 corridas só com bots, dificuldade).

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

## Entrega 16: tabuleiro cinematográfico

- **Resolução própria do tabuleiro:** enquanto o tabuleiro está na tela o jogo roda em **960x540** (o dobro dos minigames, que continuam em 480x270 e voltam sozinhos ao sair do tabuleiro). O mundo é o mapa ×2 (1600x1120) e a proporção 16:9 não muda, então menus e HUD em React ficam como estavam.
- **Cenário novo (`src/game/art/boardArt.ts`, tudo procedural):** ilha com falésia, espuma e areia, grama em manchas, estradas de pedra com praças sob cada casa, pontes de madeira com corrimão, lago com vitórias-régias e rios, **castelo grande** (torres, ameias, portão, tochas, estandartes), vila, pinheiros, árvores de copa redonda, pedras, flores, poços e fardos de feno.
- **Ambiente vivo:** sombras de nuvens passando, brilhos no mar e nas flores, bandeiras ao vento, tochas tremeluzindo, vaga-lumes e revoadas de pássaros. "Reduzir animações" desliga tudo isso.
- **Casas mais claras:** cada tipo tem **forma + cor + ícone grande** (azul +, vermelha −, evento ?, minigame ▶, loja sacola, estrela, duelo espadas, teleporte portal, tesouro baú, armadilha espinhos), espessura 3D e brilho. **Passe o mouse** (ou toque) numa casa para ver o nome e o que ela faz; o botão **?** (ou a tecla **L**) abre a legenda de todas as casas. Nas bifurcações cada opção mostra o nome da casa.
- **Ao cair numa casa:** faixa com o ícone, o nome da casa, o que aconteceu e quem foi; anel de choque, explosão de partículas na cor da casa, quique da casa, tremor nas ruins (vermelha/armadilha), clarão nas boas (tesouro/duelo).
- **Dado:** aparece grande no meio da tela, gira e quica perdendo altura (rastro e sombra), troca de faces até parar, anel + brilhos + número gigante e então voa para a **placa PASSOS** no canto, que mostra os passos que faltam (também sobre a cabeça do peão).
- **Movimento:** saltos com esticar/amassar, poeira e quique da casa na chegada; teleporte com colunas de luz; escorregão da armadilha; estrela voando para a nova casa com rastro, tremor e clarão. Câmera suave que segue o peão da vez, com panorâmica ao castelo no início da rodada.
- **HUD:** cartões com retrato, **contador de moedas que rola** (verde ao ganhar, vermelho ao perder), moedas voando do peão para o cartão (e do cartão ao perder), estrelas e itens, cartão do jogador da vez em destaque, barra de progresso das rodadas, ponteiro dourado para a estrela quando ela está fora da tela. Em telas pequenas o HUD cresce e os cartões viram uma coluna compacta.
- Títulos de tela cheia: **RODADA N**, **GRANDE FINAL!**, **HORA DO MINIGAME!**, **ESTRELA!**. O aviso em texto do topo (toast) virou leitura para leitores de tela, já que a cena mostra tudo.
- Servidor, protocolo, regras e testes **não mudaram**. Teste visual: servidor com `PIXEL_PARTY_FAST=1`, `npm run dev`, e `python3 tests/e2e/ceremony_mobile.py` (partida completa passando por todas as trocas de resolução).

## Entrega 15: sprites redesenhados (teste de tamanho maior)

- Personagens passaram de 12x16 para **16x22 px** (quadro 18x24, pés na última linha). Cabeça chibi com olhos 2x2 com brilho, bochechas e boca; Teco (chapéu de aventura), Mel (cabelo vermelho com laço), Barnabé (chapéu com faixa dourada, cabelo e barba brancos), Pip (capuz verde com pena), Bit (robô com visor e antena) e Gosmo (gosma com brilho).
- Mesmo conjunto de animações (espera, caminhada, corrida, pulo, queda, comemoração, derrota, surpresa) e o mesmo passe de acabamento (luz/sombra e contorno tingido).
- **Gameplay não muda**: colisões, hitboxes e velocidades ficam na lógica compartilhada (`shared/`), independentes do tamanho do sprite. O que muda é só a aparência: o sprite ocupa ~37% mais altura que a caixa de colisão antiga. Se algum minigame parecer "injusto" (flecha passando por cima do chapéu, por exemplo), dá para reduzir a escala daquele minigame.
- `/dev/sprites`: página de desenvolvimento com todos os personagens × animações.
## Entrega 14: refatoração gráfica (cenários, plataformas e personagens)

Referência: cenário de entardecer com céu em degradê, sol, montanhas, pinheiros e plataformas de grama sobre pedra.
- `src/game/art/scenery.ts` (novo): céu em faixas com transição pontilhada, estrelas, sol com brilho, nuvens com luz e sombra, montanhas com contorno iluminado, pinheiros em camadas, plataforma/chão de grama + pedra, caixa, água. Tudo por código.
- **Duelo de Arqueiros**: novo fundo, chão e plataformas de grama sobre pedra (visual com 16 px de altura; a colisão não mudou), pilares de pedra azul.
- **Corrida Maluca**: céu, montanhas e floresta em parallax, chão de grama e pedra, água com espuma, caixas novas.
- **Caça-Moedas**: grama com tons e tufos, árvores redondas com 4 tons de luz, pedras com sombra e musgo, vinheta suave.
- **Chuva de Pedras**: mesmo céu de entardecer atrás da arena.
- **Personagens (todos os minigames e o tabuleiro)**: sombreamento automático (luz no canto superior esquerdo, sombra embaixo/direita) e contorno "seletivo" tingido pela cor da peça.
- Reflexo Relâmpago, Piso de LED, Último Disparo e Quebra-Cabeça mantidos (já têm visual próprio de painel/arena); menus não foram alterados.
- Limitações: os personagens continuam em 12x16 px (só ganharam volume), não foram redesenhados quadro a quadro.

## Entrega 13: polimento de arte, sons e música

- **Ícones de pixel (sem emojis)**: `src/components/PixelIcon.tsx` desenha moeda, alvo, troféu, pegadas, cérebro, balança, itens (cogumelo, ímã, poção, escudo, dado), estrela e som/mudo a partir de mapas de pixels. Corrige o ícone do "Rei das Moedas" (o emoji aparecia como quadrado em algumas fontes). Usados na cerimônia, itens, loja e HUD.
- **Música original (5 faixas, chiptune sequenciado em código)**: menu, tabuleiro, minigame, suspense e triunfo. Têm melodia, baixo, arpejo e bateria sintetizada (bumbo, caixa, chimbal). A faixa troca sozinha por contexto: menu → tabuleiro → minigame → cerimônia (suspense durante os prêmios, triunfo no campeão) → menu.
- **Novos efeitos**: passos, rolar do dado, estrela, loja, compra, duelo, teleporte, armadilha, rufar de tambor, golpe de revelação, fanfarra e sinal de desempate.
- **Ambiente do tabuleiro**: vaga-lumes animados (desligados com "Reduzir animações").
- **Botão de som** na partida (liga/desliga rápido), além dos volumes separados de música/efeitos nas configurações.
- `CREDITS.md`: tudo é original/gerado em código; fonte Pixelify Sans (OFL).
- Testes: `tests/audio.test.ts` (faixas e troca de faixa sem contexto de áudio).
- Limitações: o som não pôde ser ouvido por mim (ambiente sem áudio), só validado por teste de estrutura e ausência de erros; os volumes/ritmos podem precisar de ajuste de ouvido. Arte dos personagens/tiles não foi redesenhada nesta entrega.

## Entrega 12: Grande Final (cerimônia), acabamento e qualidade

A Grande Final **não é minigame**. Ao fim da rodada 12 o servidor calcula 5 prêmios (1 estrela cada) a partir das estatísticas da jornada e o cliente os revela numa cerimônia animada:

| Prêmio | Critério |
|---|---|
| Rei das Moedas | mais moedas ganhas nos minigames |
| Caçador | mais abates/eliminações nos minigames |
| Campeão | mais minigames vencidos |
| Explorador | mais casas percorridas |
| Estrategista | mais itens usados + duelos vencidos |

- Suspense: cartões escondidos ("?"), os outros jogadores aparecem apagados em ordem crescente, o vencedor surge grande, com brilho e estrela voando para o placar.
- **Desempate**: por moedas do tabuleiro, com aviso explícito na tela ("Empate em N abates! Desempate por moedas do tabuleiro: ..."). Se ainda empatar, ninguém leva a estrela do prêmio. Ranking final: estrelas, moedas, minigames vencidos; empates aparecem marcados.
- Ranking revelado de baixo para cima, campeão com confete e fogos. "Pular para o resultado" (ou Espaço/Enter para avançar). "Jogar novamente" (anfitrião) volta ao lobby; "Rever cerimônia".
- Reduzir animações (configuração) encurta a cerimônia, remove brilhos/oscilações do tabuleiro.
- Celular: o palco fica mais alto (9:14) durante a cerimônia.
- Persistência (sem contas): `server/store.ts` guarda resumos das últimas 50 partidas em memória; `GET /matches` devolve as últimas 20. Trocar por banco depois é só implementar `MatchStore`.
- Simulação em massa: `npm run sim:games -- 200 --fake` (minigames falsos, rápido); sem `--fake` usa minigames reais.
- E2E (Playwright/Python, servidor com `PIXEL_PARTY_FAST=1 PORT=3001 npm run dev:server` e `npm run dev`): `python3 tests/e2e/ceremony_mobile.py` (viewport de celular, partida completa até a cerimônia e volta ao lobby).
- Testes: `npm test` (inclui `tests/final.test.ts`).
- Limitações: áudio da cerimônia usa os sfx existentes (sem música); histórico some ao reiniciar o servidor; estilo geral ainda minimalista para a fase de polimento final.

## Entrega 11: economia, itens, lojas, eventos, duelo e teleporte

(Estilo visual mínimo de propósito: o polimento fica para o fim do projeto.)

**Estrela**: agora custa **25** moedas. Quem está 2+ estrelas atrás do líder paga 5 a menos (anti-snowball), nunca menos de 10. Depois da compra a estrela muda para outro altar a 5+ passos de quem comprou. O evento "estrela mais barata" reduz 8 até o fim da rodada. Dá para comprar parando **ou passando** pelo altar.

**Itens** (máx. 2 por jogador, 1 uso por turno, usados antes de rolar; o servidor valida posse, vez, alvo e valor):
- Cogumelo Veloz (8): dois dados, escolhe um. Ímã de Moedas (10): rouba 5 de um adversário. Poção de Teleporte (9): vai a um destino de teleporte em vez de rolar. Escudo (7): bloqueia sozinho um roubo ou uma armadilha. Dado Especial (6): escolhe 1 a 3.
- Ícones são emojis por enquanto (estilo mínimo). A "animação de uso" é só som + aviso na tela por enquanto.

**Loja** (casas de loja e comerciante): lista com preço, descrição e saldo; compra vários itens até encher o inventário; "Sair da loja". **Duelo** (casa central): escolhe um adversário, os dois rolam um dado, o maior leva até 5 moedas (empate repete até 3 vezes). **Teleporte**: escolhe o destino (outra casa de teleporte, altar da estrela, portão do castelo) ou fica.

**Eventos aleatórios** (casas de evento): comerciante misterioso (loja com -2), baú (moedas ou item), troca de moedas (limitada a 10), estrela mais barata, teletransporte, recompensa inesperada, armadilha (o Escudo bloqueia), sorte.

**Eventos das rodadas**: 3 Chuva de Tesouros (6 casas com brilho dão +4 extras), 6 Erupção Vulcânica (porto bloqueado nas rodadas 6 e 7 e dois caminhos novos: S2–R12 e A3–L2), 9 Portal Misterioso (sorteia: todos trocam de lugar, ou todos ganham um item, ou uma estrela secreta de 12 moedas num altar só naquela rodada), 12 Última rodada (aviso) e depois a Grande Final (cerimônia de prêmios, Entrega 12).

**Histórico**: painel "Histórico da partida" (eventos e últimas mudanças de moedas com motivo e saldo). **Bots**: usam itens, compram na loja, escolhem teleporte e duelo conforme a personalidade (coletor, agressivo, cuidadoso, apostador) e a dificuldade.

**Testar**: `npm test` (205 testes; `tests/entrega11.test.ts` cobre itens, loja, duelo, teleporte, custo da estrela, eventos 3/6/9 e 60 partidas de bots com invariantes) e `smoke:game` como na Entrega 10. No jogo, use a loja (casas laranja) e os botões de item ao lado de "Rolar o dado".

**Limitações**: sem animação própria por item, só sons e avisos; o duelo é de dados (não de minigame); a estrela secreta e a Erupção só têm marcação simples no mapa; o inventário aparece numa faixa abaixo do palco, não no HUD do Phaser.

## Entrega 10: Tabuleiro "Reino do Castelo" e rodadas

Partida jogável de ponta a ponta: 1 a 4 humanos + bots, 12 rodadas, um minigame por rodada.

**Onde está**
- `shared/board/` mapa em dados (`maps/reino-do-castelo.ts`: 40 casas, 7 bifurcações, 2 pontes), grafo e validações.
- `shared/game/engine.ts` motor puro e determinístico (fases, dado, passos, bifurcações, efeitos, estrela, ordem alternada, final). `boardBot.ts` decisões dos bots por personalidade/dificuldade.
- `server/match.ts` ritmo da partida, bots, queda/volta de conexão; `server/minigameSession.ts` roda cada minigame dentro da sala (mesmos eventos `mg:*` do laboratório).
- `src/game/views/BoardView.ts` + `art/boardTextures.ts` visual em Phaser; `src/components/MatchStage.tsx` tela da partida.

**Regras desta entrega**: começa com 10 moedas; azul +3, vermelha -3 (nunca abaixo de 0), tesouro +5..15, armadilha (50% -3 moedas / 50% volta 2 casas), teleporte entre as 2 casas de teleporte, casa de minigame = minigame extra para todos (máx. 1 extra por rodada), altar com a estrela e 20+ moedas (agora 25, ver Entrega 11) = comprar (também ao *passar* pelo altar). Depois de comprar, a estrela muda para outro altar a 5+ passos de quem comprou. Fim da rodada = minigame (peso por sorteio, nunca repete o anterior, cada uso anterior pesa 0,35x). A ordem gira 1 posição a cada rodada. Rodada 12 é a "GRANDE FINAL". Desempate: estrelas, moedas, minigames vencidos; empate total divide a colocação.

**Provisório (fica para a Entrega 11, dito com honestidade)**: casas de evento sorteiam só um valor de moedas (-2..+5); loja e duelo só mostram uma mensagem; sem itens, sem eventos especiais das rodadas 3/6/9/12, sem escolha de teleporte, sem anti-snowball na estrela além da distância, sem histórico/economia detalhada na tela; a Grande Final (substituída na Entrega 12 por uma cerimônia de prêmios, não é mais minigame).

**Conexão**: humano que cai é substituído por bot na vez dele (espera 45 s) e recupera o controle ao voltar (a página restaura a partida). Humano presente que fica parado por 3 min joga por bot (proteção contra travar a sala).

**Testar**
- `npm test` (engine, mapa, 12 rodadas com bots em 40 sementes).
- `PIXEL_PARTY_FAST=1 PORT=3011 npm run dev:server` e, em outro terminal, `URL=http://localhost:3011 npm run smoke:game` (1, 2 e 4 humanos por socket, partida inteira).
- Jogo real: `npm run dev`, abrir `http://localhost:3000`, Criar partida, Estou pronto, Iniciar. Espaço rola o dado; setas/WASD ou toque escolhem caminho; botão Comprar/Agora não na estrela. Para andar mais rápido: `PIXEL_PARTY_SCALE=0.4 npm run dev:server` (acelera pausas; minigames seguem em tempo real).

## Entrega 8: Chuva de Pedras (`chuva-de-pedras`) — categoria competição (ocupa o lugar de "Missão Impossível")

- **60 s**, 4 jogadores todos contra todos, arena pequena e limpa (280x192) vista de cima, sem obstáculos: só jogadores e pedras. **Controles:** WASD/setas (joystick no celular). Encostar na pedra empurra sozinho.
- **Quedas:** a **marcação vermelha pulsa** (cada vez mais rápido) com um anel que fecha e um alvo, de 1,5 s de aviso no começo até 0,95 s no fim; a pedra gigante cai em perspectiva (sombra que cresce) e **fica na arena**. Quem está embaixo é **esmagado**. Metade das quedas pressiona alguém (quem fica parado apanha), nunca nascem sobre outra marcação ou pedra, e há no máximo 11 pedras/marcações. O ritmo acelera (de ~1,25 s para ~0,5 s entre quedas; depois de 55% do tempo, às vezes caem 2).
- **Onda de choque:** perto de uma queda (sem ser esmagado) você é **empurrado** e conta **1 impacto**. É o critério de desempate no fim do tempo.
- **Empurrar:** ao encostar numa pedra parada ela **desliza na direção oposta ao ponto de contato** (qualquer ângulo, 270 px/s, atrito até parar). Pedra parada é sólida (não dá para atravessar); encostada na parede, na direção da parede, não sai do lugar. Quem empurrou tem 0,35 s de folga para não ser atingido pela própria pedra.
- **Colisões:** pedra deslizando elimina quem toca; contra pedra parada, **destrói a parada e segue**; duas deslizando **se destroem**; queda por cima de uma pedra a esmaga. As pedras **param nas paredes** (escorregam em paralelo se batem em ângulo).
- **Vitória:** último vivo vence (fim 1,2 s depois). Se o tempo acabar, **vencem os vivos** e, entre eles, quem teve **menos impactos**; iguais dividem. Eliminados: quem caiu depois é melhor, mesmo instante empata (inclusive todos juntos = empate geral). Recompensa 8/6/4/3 com empate dividindo, **+1 moeda por abate** feito com pedra empurrada (`bonus`), com estatísticas no resultado.
- **Servidor autoritativo:** quedas, empurrões, colisões, eliminações e impactos; o cliente só envia direção.
- **Bots:** desviam das marcações (reação por dificuldade), preveem a trajetória de pedras deslizando e, médio/difícil, caçam: ficam do lado oposto de uma pedra em relação a um inimigo e encostam para lançá-la nele. Em 60 partidas de bots médios: ~2,5 eliminações por jogo, quase todas por pedra empurrada, duração média ~36 s.
- **Arte e efeitos:** piso de pedra claro (marcação bem visível), moldura dourada, pedra gigante de pixel art, poeira, onda de choque, flash e **tremor de tela** no impacto, rastro de poeira no deslizamento, estilhaços ao quebrar, "ESMAGADO / KO / IMPACTO / +1". Testes: `tests/chuva-de-pedras.test.ts` (21).

## Entrega 7.2: moedas, 3 vidas e menus responsivos

- **Moedas no lugar de "pontos de destaque":** a moeda é a pontuação que vale no tabuleiro, então os abates agora rendem moedas: **+1 por abate** e **+1 extra no ÚLTIMO HIT**, somadas à recompensa da colocação (8/6/4/3). Não mudam a colocação nem desfazem empates. O cartão do jogador mostra caveira (abates), alvo (acertos) e moeda (bônus acumulado).
- **Vida inicial = 3 corações** (máx. 4 com o item de vida extra).
- **Tutorial e resultado responsivos:** os cartões sobre a arena usam unidades relativas ao tamanho do palco (fonte, espaços e largura encolhem junto) e rolam por dentro se ainda assim não couberem.

## Entrega 20 — Nomes sobre os personagens (todos os minigames)
- Novo `src/game/views/nameTags.ts` (`NameTags`): o nome de cada jogador aparece sobre o personagem (cor do slot) e some com fade depois de 5 s de partida (a contagem já mostra). Usado por Corrida, Reflexo, Caça-moedas, Piso LED, Último Disparo, Duelo, Chuva de Pedras e Futebol (que reexibe os nomes depois de cada gol).
- Futebol: removidos os rótulos fixos; usa as mesmas etiquetas temporárias.
- O "Jogador" no Lab era só o nome padrão do campo do laboratório; agora o Lab usa o nome salvo no jogo (`pixel-party:name`) quando existir. Em partidas reais já valia o nome escolhido.
