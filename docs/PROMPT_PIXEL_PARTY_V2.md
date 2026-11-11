# PIXEL PARTY — PROMPT DE DESENVOLVIMENTO V2 (ENTREGAS JOGO A JOGO, 4 JOGADORES + BOTS)

## 0. COMO ESTE PROMPT FUNCIONA

Você é o desenvolvedor principal, game designer e diretor de arte do **PIXEL PARTY**.

Arquivos de referência que existem no projeto:

- `docs/PIXEL_PARTY_SPEC.md` — a especificação mestra (25 seções).
- `docs/concept/painel_conceitual.png` — painel conceitual visual (apenas BASE de estilo, nunca cópia literal).

**Regra de prioridade:** este documento ALTERA e tem prioridade sobre a especificação mestra onde houver conflito. Em tudo que não for alterado aqui, a especificação mestra continua valendo (stack, arquitetura modular, servidor autoritativo, direção de arte, qualidade, acessibilidade, áudio, etc.).

**Regra de trabalho (obrigatória):**

1. Desenvolva **uma ENTREGA por vez**, na ordem da seção 8.
2. Ao terminar cada entrega, **PARE**. Não comece a próxima até eu escrever "aprovado" ou enviar correções.
3. Toda entrega termina com o relatório da seção 9.
4. Antes da Entrega 0, examine o projeto existente (estrutura, dependências, scripts, versões) e me apresente uma estratégia curta. Não troque tecnologias nem apague arquivos importantes sem necessidade.
5. Nada de placeholders, botões mortos, minigames que só mostram "clique para vencer" ou multiplayer falso. Se algo ficar incompleto, diga claramente no relatório.

---

## 1. MUDANÇA PRINCIPAL: ATÉ 4 JOGADORES, VAGAS VAZIAS = BOTS

Toda partida tem **sempre 4 participantes**. De 1 a 4 são humanos; **cada vaga sem humano é ocupada por um bot**.

### Sala e lobby

- A sala tem 4 slots fixos (cores de jogador: vermelho, azul, verde, amarelo — usadas em anéis sob os personagens, placar e HUD).
- O host cria a sala e recebe o código de convite. Humanos entram em slots livres (que estavam com bot) enquanto o lobby estiver aberto.
- Slots vazios mostram um bot automaticamente, com nome, personagem e dificuldade. O host pode trocar a dificuldade de cada bot (FÁCIL, MÉDIO, DIFÍCIL) e a personalidade (ver seção 3).
- Bots estão sempre "prontos". A partida inicia quando **todos os humanos conectados** estiverem prontos. O host pode iniciar com 1 humano (modo solo contra 3 bots — também serve para eu testar sozinho).
- Personagens são **únicos por sala**: dois participantes não podem usar o mesmo.
- Se um humano entra depois que o bot foi escolhido, ele toma o lugar do bot, sem quebrar o lobby.

### Desconexão e reconexão (adaptação da seção 15)

- Humano desconecta: pausar a partida por um tempo configurável (padrão 45 s) com aviso aos demais.
- Se o tempo esgotar: **um bot assume o slot** (mantendo moedas, estrelas, itens e posição) e a partida continua.
- Se o humano voltar depois, pode **retomar o slot** de volta no início da próxima rodada ou ao fim do minigame atual (nunca no meio de uma ação).
- Se o host sair, o host migra para outro humano. Se não restar nenhum humano, a sala é encerrada após um timeout.
- Recompensas nunca são duplicadas por reconexão (identificar cada evento de recompensa por id único).

---

## 2. ADAPTAÇÕES DAS REGRAS PARA 4 PARTICIPANTES

**Ordem de turno:** alternar/rotacionar a cada rodada (a ordem de rodada N+1 é a da rodada N rotacionada em um). Turnos de bots devem ser rápidos (dado + movimento com pausa curta e legível) para a rodada não ficar longa.

**Câmera:** acompanha o jogador ativo. Fora do turno, mostrar mini-placar com os 4 (moedas, estrelas, itens, posição no mapa). Um indicador na borda da tela mostra onde estão os outros.

**Recompensas de minigame competitivo (ranking, configurável em JSON):**

| Colocação | Moedas |
|---|---|
| 1º | +8 |
| 2º | +6 |
| 3º | +4 |
| 4º | +3 |

Empates dividem a colocação e recebem a média arredondada para baixo das posições empatadas (ex.: empate no 1º lugar entre dois = média de 8 e 6 = +7). Todos os 4 sempre ganham pelo menos +3.

**Minigame cooperativo (Missão Impossível):** os 4 cooperam como uma equipe. Concluir = +6 moedas para cada, mais bônus individual de até +3 (por contribuição medida pelo servidor). Falhar = nenhuma recompensa de conclusão.

**Duelo (casa DUELO):** o jogador que caiu escolhe um oponente (bots escolhem por regra de personalidade). Aposta de moedas fixa e pequena, minigame curto 1x1 sorteado dentre os compatíveis. Vencedor leva a aposta do perdedor (nunca deixa saldo negativo).

**Roubo / Ímã de moedas:** o usuário escolhe o alvo entre os adversários. O ESCUDO protege quem o possui. Bots usam a mesma validação.

**Portal Misterioso (rodada 9):** troca de posição entre dois jogadores sorteados ou escolhidos conforme o evento; nunca o líder sozinho é punido de modo a decidir a partida.

**Estrelas:** continuam custando 20 moedas e mudam de lugar após cada compra. Para 4 jogadores, a estrela nunca reaparece a menos de N casas do último comprador (configurável) — evita snowball.

**Anti-snowball (importante com 4 jogadores):**

- Evento "Estrela mais barata" favorece prioritariamente quem está em último.
- Casas de tesouro/evento podem dar bônus "de recuperação" para quem está atrás, limitado e visível para todos.
- Nenhum evento aleatório pode, sozinho, decidir o vencedor.

**Final:** pódio com 4 posições. Desempate: estrelas > moedas > minigames vencidos > vitória compartilhada.

**Seleção de minigames:** sistema de pesos configurável, sem o mesmo minigame em rodadas seguidas, e com compatibilidade para 4 participantes (todos os 8 minigames precisam funcionar com exatamente 4).

---

## 3. SISTEMA DE BOTS (OBRIGATÓRIO, PARTE DA ARQUITETURA)

Bots são **jogadores de verdade para o servidor**: enviam as mesmas intenções que um humano enviaria e passam pela **mesma validação**. Eles **não podem trapacear** (não leem o estado oculto, não ignoram regras, não têm tempo de reação de 0 ms).

Estrutura sugerida:

```ts
type BotDifficulty = 'easy' | 'medium' | 'hard';
type BotPersonality = 'collector' | 'aggressive' | 'careful' | 'gambler';

interface BotProfile {
  id: string;
  name: string;
  characterId: string;
  difficulty: BotDifficulty;
  personality: BotPersonality;
}

// Decisões do tabuleiro (escolher caminho, comprar, usar item, escolher alvo)
interface BoardBrain {
  decide(view: BoardPlayerView, rng: Rng): BoardIntent;
}

// Decisões em tempo real de cada minigame (chamado a cada tick do servidor)
interface MinigameBrain<Obs, Input> {
  decide(obs: Obs, dt: number, rng: Rng): Input;
}
```

Requisitos:

- **Dificuldade** controla: tempo de reação (com variação aleatória), taxa de erro, precisão e agressividade. FÁCIL perde com frequência para humanos, DIFÍCIL é desafiador mas justo.
- **Personalidade** altera decisões no tabuleiro: colecionador prioriza moedas e estrela, agressivo prioriza roubo e duelo, cuidadoso evita casas vermelhas/armadilhas, apostador prioriza eventos e tesouros.
- Cada minigame tem seu próprio `MinigameBrain`, inclusive o cooperativo (o bot executa seu papel de forma confiável para que 1 humano + 3 bots consigam concluir a missão).
- Ações de bots têm atrasos pequenos e naturais (ex.: 600–1500 ms para escolher no tabuleiro) para o jogo parecer vivo, e respeitam "reduzir animações".
- A interface identifica bots claramente (ícone de robô ao lado do nome), sem humilhar: nomes amigáveis.
- Testes automáticos: rodar **simulações headless de partidas só com bots** (12 rodadas completas) para detectar travamentos, estados inválidos e recompensas duplicadas.

---

## 4. ADAPTAÇÃO DO PAINEL CONCEITUAL (BASE, NÃO CÓPIA)

Use a imagem como direção de estilo e **corrija o que não serve para o jogo**:

**Aproveitar:**

- Estilo 16-bit alegre, bordas escuras sobre sprites, cores vibrantes mas harmônicas.
- **Tabuleiro em formato de "diorama"**: ilha/terreno flutuante com borda de grama e lateral de terra, visão superior com leve perspectiva. Castelo ao topo, trilha de pedra em anel com atalhos internos, rio que forma lago, casinhas, florestas, pontes. Este será o visual do **primeiro mapa**.
- Fundo roxo/crepúsculo com nuvens e silhueta de pinheiros nas telas de menu e de transição.
- **Painéis de UI**: azul-marinho escuro com borda dourada, título em dourado, texto em creme.
- Logo com letras douradas em estilo pixel encorpado e faixa "JOGUE • EXPLORE • DIVIRTA-SE".
- Quatro personagens-base como inspiração (menino de camisa azul, menina de laço, mago de chapéu roxo, arqueiro de capuz verde) — com 4 jogadores esses são o núcleo; adicionar mais 2 para chegar a 6 (por exemplo robô e criatura verde), todos com silhuetas distintas.
- Casas de tipos diferentes com ícones claros: baú (item), caveira (desafio/armadilha), "?" (evento), estrela dourada.

**Corrigir / adaptar:**

- No painel, a estrela representa "minigame". No jogo, **a estrela dourada é reservada para a ESTRELA de vitória** (objetivo principal, com brilho, aura e destaque). A casa de minigame usa outro ícone (ex.: controle de videogame ou raio).
- O painel tem só 4 ícones de casa. O jogo precisa de **todos os tipos da especificação**: azul, vermelha, minigame, evento, loja, estrela, duelo, teleporte, tesouro e armadilha. Cada um com ícone e cor distintos, legíveis a distância e com contraste (também para daltonismo: forma + cor, nunca só cor).
- O painel mostra apenas um anel simples. O mapa real deve ter **bifurcações, atalhos e pontes** (seção 6 da especificação) e ~40 casas com ids únicos definidas em dados (JSON/TS), nunca em ifs espalhados.
- Mostrar ícones de casa no mapa em tamanho suficiente para leitura em celular.
- Menu do painel tem "Jogar / Configurações / Sair". Usar o menu da especificação: **CRIAR PARTIDA, ENTRAR NA PARTIDA, PERSONAGENS, CONFIGURAÇÕES** (e "Treino de minigames" visível apenas no modo desenvolvimento).
- Nome do projeto: **PIXEL PARTY** (o painel diz "Pixel Adventure"; é só conceito).
- Mapa da Ilha dos Tesouros da especificação vira o **segundo mapa**, ou pode ser fundido se fizer sentido artisticamente. O primeiro mapa segue o diorama do painel. A arquitetura deve permitir adicionar mapas sem mexer na lógica principal.

---

## 5. ARTE E TÉCNICA (RESUMO + DECISÕES FIXAS)

- Resolução interna: **480×270** (16:9), escala por inteiros, `pixelArt: true`, `roundPixels`, sem interpolação.
- Tiles de **16×16**. Personagens em estilo chibi (cabeça grande) com cerca de **16×24**, com contorno escuro.
- Paleta única e documentada em `src/game/art/palette.ts` (máx. ~32 cores) usada por todos os sprites, para manter consistência.
- **Pipeline de arte** (já que não há artista): sprites definidos como mapas de pixels com índices da paleta (arquivos de dados), compilados por script em **spritesheets/atlas** carregados pelo Phaser. Nada de formas geométricas simples como personagens, nada de emojis como sprite, nada de arte só com CSS.
- Cada personagem tem: idle, walk, run, jump, fall, win, lose, surprised, celebrate.
- **Áudio** original e livre de direitos: efeitos gerados proceduralmente (WebAudio, estilo chiptune) e músicas curtas em loop sequenciadas em código, ou arquivos livres com licença anotada em `CREDITS.md`. Volumes independentes de música e efeitos, mudo, e respeito a "reduzir animações".
- UI de menus/lobby em React/CSS com tema do painel; HUD e jogo em Phaser.
- Celular: joystick virtual + botões grandes; nada que dependa de hover.

---

## 6. ARQUITETURA DE MINIGAMES (BASE DE TODAS AS ENTREGAS)

Os minigames em tempo real são **simulados no servidor** (tick fixo, ex.: 30 Hz). O cliente envia apenas **inputs** (com número de sequência), recebe snapshots e interpola/renderiza. O cliente nunca informa pontuação, posição final ou vencedor.

Cada minigame é um módulo independente com contrato único (lógica compartilhada entre servidor e testes, cena Phaser só no cliente):

```ts
interface MinigameDefinition<State, Input, Obs> {
  id: string;
  name: string;
  category: 'speed' | 'reaction' | 'skill' | 'survival' | 'memory' | 'logic' | 'combat' | 'coop';
  mode: 'ffa' | 'coop';
  durationMs: number;
  minParticipants: 4; // sempre 4 (humanos + bots)
  createInitialState(seed: number, players: ParticipantInfo[]): State;
  step(state: State, inputs: Record<PlayerId, Input>, dtMs: number): State; // determinístico
  isFinished(state: State): boolean;
  computeResult(state: State): MinigameResult; // ranking com empates, ou sucesso/falha coop
  bot: MinigameBrain<Obs, Input>;
  scene: string; // chave da cena Phaser
  instructions: { title: string; lines: string[]; controls: ControlHint[] };
}
```

Todo minigame deve ter: tela de apresentação, instruções (teclado e toque), contagem regressiva 3-2-1-GO, temporizador visível, pontuação, condição de fim, tela de resultado com ranking de 4, animações e efeitos sonoros, tratamento de desconexão (bot assume) e **recompensa aplicada uma única vez**.

### Laboratório de Minigames (rota apenas em desenvolvimento: `/dev/minigames`)

Criado na Entrega 0 para eu testar cada jogo isoladamente:

- Escolher o minigame, quantos humanos (1–4; o resto vira bot), dificuldade dos bots e seed.
- Usa o **servidor real** (Socket.IO) com uma sala de teste, então posso abrir duas abas/dispositivos para testar de verdade.
- Botões: reiniciar, nova seed, pular instruções, exibir hitboxes/depuração, mostrar latência.
- Mostra o resultado bruto (ranking, pontos, recompensa calculada).
- Modo "bots apenas" acelerado para testar o jogo sem humanos.

---

## 7. MINIGAMES PARA 4 PARTICIPANTES

Mantenha as mecânicas e durações da especificação, com estas adaptações:

1. **CORRIDA MALUCA** (~35 s): 4 faixas lado a lado, mesma pista gerada por seed (idêntica para todos). Pulo, obstáculos, buracos, plataformas, atalhos, moedas. Ranking pela ordem de chegada; quem não chegar é ordenado pela distância.
2. **REFLEXO RELÂMPAGO** (~25 s): cada jogador tem sua faixa com símbolos/teclas. A sequência vem do servidor com **intervalos imprevisíveis** (seed), igual para todos para ser justo. Acerto = pontos; erro = penalidade de tempo. Dificuldade crescente.
3. **CAÇA-MOEDAS** (~40 s): arena top-down com 4 personagens, moedas de valores diferentes, obstáculos, itens temporários (ex.: ímã, velocidade). Ranking por pontos.
4. **CHÃO PERIGOSO** (~30 s): plataformas que piscam e somem, 4 jogadores, empurrões para eliminar. Ranking pela ordem de eliminação; se vários sobreviverem, desempata por tempo e plataformas alcançadas.
5. **MEMÓRIA DE PIXEL** (~40 s): cada jogador tem **a mesma grade** (mesma seed), vista por todos no início, depois virada. Ranking por pares encontrados, com erro custando tempo. Cartas com símbolos pixel art originais.
6. **QUEBRA-CABEÇA RELÂMPAGO** (~45 s): mesma imagem pixel art para todos, peças embaralhadas (mesma seed), mover/trocar por clique ou toque. Ranking por ordem de conclusão e, se ninguém concluir, por progresso.
7. **ARENA EXPLOSIVA** (~40 s): 4 jogadores em arena com blocos destrutíveis, bombas com contagem visível, explosões em cruz que respeitam obstáculos, power-ups (alcance, velocidade, escudo). Ranking pela ordem de eliminação, com desempate por tempo.
8. **MISSÃO IMPOSSÍVEL** (~45 s, cooperativo): os 4 cooperam em uma fase de plataforma/puzzle com mecânicas que **exigem** os papéis (interruptores, portas, plataformas seguradas, objetos altos, saída que só abre com todos). O desafio escala com 4 pessoas. Bots executam seus papéis de modo confiável.

---

## 8. ENTREGAS (UMA POR VEZ, PARE AO FINAL DE CADA)

**ENTREGA 0 — Fundação e Laboratório**
Análise do projeto, estratégia, estrutura de pastas, tipos compartilhados cliente/servidor, servidor Socket.IO base com tick, pipeline de arte + paleta, sistema de áudio base, sistema de bots (interfaces e infraestrutura), contrato de minigame (seção 6) e o `/dev/minigames`. Para provar que funciona, inclua um minigame de teste mínimo apenas para validar o pipeline (será removido).
*Teste: abrir o laboratório, rodar a sala de teste com 1 humano + 3 bots, ver resultado.*

**ENTREGA 1 — Menu, salas e lobby de 4 jogadores**
Menu principal animado, criar/entrar por código, lobby com 4 slots, bots automáticos configuráveis, seleção de personagens únicos (seis personagens com animações), prontidão, validações e mensagens de erro, reconexão básica e host migration.
*Teste: criar sala, entrar de 2 abas/dispositivos, ver bots preenchendo o resto, começar.*

**ENTREGA 2 a 9 — Um minigame por entrega** (na ordem da seção 7, 1 a 8)
Cada uma inclui: arte e animações do minigame, regras, servidor autoritativo, cena Phaser, bot funcional, tela de resultado, som, mobile, testes automatizados da lógica e simulação só com bots.
*Teste: abrir o laboratório e jogar com 1 a 4 humanos.*

**ENTREGA 10 — Tabuleiro e rodadas**
Primeiro mapa (diorama do castelo), ~40 casas em dados, dado animado, movimento casa a casa, bifurcações, câmera, máquina de estados da partida (12 rodadas, alternância de ordem), efeitos de casas, integração dos 8 minigames pela seleção ponderada, placar de 4 jogadores, turnos de bots.
*Teste: partida completa com 1 humano + 3 bots, e depois com 2+ humanos.*

**ENTREGA 11 — Economia, estrelas, itens, lojas e eventos**
Moedas centralizadas com histórico, estrelas e relocação, 5 itens com ícones e animações, lojas, eventos das rodadas 3/6/9/12, eventos aleatórios, duelo, teleporte, anti-snowball e comportamento dos bots no tabuleiro por personalidade.

**ENTREGA 12 — Final, polimento e qualidade**
Grande final com pódio de 4, estatísticas, confete/fogos, jogar novamente, persistência opcional (estrutura pronta, sem exigir contas), áudio completo, reduzir animações, responsividade, performance, testes ponta a ponta, simulações em massa só com bots e revisão dos critérios de aceitação (adaptados para 4 jogadores).

---

## 9. RELATÓRIO OBRIGATÓRIO AO FINAL DE CADA ENTREGA

1. O que foi implementado (e o que **não** foi).
2. Arquivos principais criados/alterados.
3. **Como testar**: comandos exatos, URLs, quantas abas/dispositivos, passo a passo.
4. **Checklist de teste** com itens que eu possa marcar.
5. Resultados dos testes automáticos e do build (sem avisos ignorados).
6. Limitações e bugs conhecidos, com honestidade.
7. Perguntas ou decisões que precisam de mim.
8. Pare e espere minha resposta.

---

## 10. PADRÕES DE QUALIDADE (RESUMO)

- TypeScript estrito, sem `any` indiscriminado, lógica separada de apresentação.
- Servidor valida tudo (turno, movimento, compras, itens, pontuação, recompensas). O cliente nunca envia moedas, vencedor ou resultado.
- Eventos de recompensa idempotentes (id único) para evitar duplicação.
- Nenhum erro crítico no console, nenhum botão principal sem função.
- Código modular que permita novos mapas, minigames, personagens, itens e eventos sem reescrever o núcleo.
- Acessibilidade: contraste, formas além de cor, reduzir animações, controles claros.

---

**Comece agora: examine o projeto existente, me apresente a estratégia curta e execute a ENTREGA 0. Depois pare e aguarde minha aprovação.**
