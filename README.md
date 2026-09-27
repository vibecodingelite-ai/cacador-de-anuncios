# 🎯 Caçador de Anúncios

Extensão do Google Chrome que analisa os anúncios da [Biblioteca de Anúncios da Meta](https://www.facebook.com/ads/library) enquanto você rola a página. Ela mostra, em cima de cada card, se o anúncio **provavelmente está dando resultado**, qual é o **ângulo da copy**, a **força do gancho** e se ele **serve de referência para o seu nicho**.

Quem decide é o **JEV** (`typesafe/jev-1.13`), o modelo de decisão da [TypeSafe](https://docs.typesafe.ai), chamado pela rota **Decisions** do [OpenRouter](https://openrouter.ai/typesafe/jev-1.13). O JEV não gera texto: ele devolve probabilidades, e a extensão transforma isso em selos. **O JEV decide, o código desenha.**

- 🔒 **Sua chave fica só no seu navegador.** Este repositório não tem nenhuma chave, e a extensão não tem servidor próprio.
- 💸 **Custa centavos de centavo.** Cada anúncio analisado custa em torno de **US$ 0,00005** (35 anúncios deram menos de 1 centavo de dólar).
- 🌎 Funciona com a Biblioteca em **português do Brasil, de Portugal, inglês e espanhol**.

---

## Sumário

1. [O que ela faz](#o-que-ela-faz)
2. [Antes de começar](#antes-de-começar)
3. [Como baixar](#como-baixar)
4. [Como instalar no Chrome](#como-instalar-no-chrome)
5. [Como criar e incluir a chave do OpenRouter](#como-criar-e-incluir-a-chave-do-openrouter)
6. [Como configurar os seus nichos](#como-configurar-os-seus-nichos)
7. [Como usar](#como-usar)
8. [Como ler os selos](#como-ler-os-selos)
9. [Painel, filtros e exportação](#painel-filtros-e-exportação)
10. [Custos](#custos)
11. [Segurança da chave](#segurança-da-chave)
12. [Como atualizar](#como-atualizar)
13. [Problemas comuns](#problemas-comuns)
14. [Como funciona por dentro](#como-funciona-por-dentro)

---

## O que ela faz

Para cada card de anúncio que aparece na tela, a extensão:

1. **Lê só o que está visível:** texto da copy, título, CTA, anunciante, data de início, há quantos dias está no ar, quantos anúncios usam o mesmo criativo e em quais plataformas roda.
2. **Faz uma única chamada ao JEV** com estas perguntas:
   - Este anúncio provavelmente está dando resultado para o anunciante?
   - Qual é o ângulo da copy? (dor, desejo, prova social, oferta/urgência, curiosidade, autoridade ou nenhum claro)
   - Qual a força do gancho da primeira frase? (fraco, ok, forte, muito forte)
   - Este anúncio serve de referência para cada um dos seus nichos? (até 3)
3. **Desenha um selo** em cima do card com o veredito.
4. **Guarda o resultado em cache**, para nunca pagar duas vezes pelo mesmo anúncio.

---

## Antes de começar

Você precisa de:

- **Google Chrome** (ou outro navegador baseado em Chromium: Edge, Brave, Opera).
- **Uma conta no OpenRouter com alguns créditos.** US$ 5 dão para analisar dezenas de milhares de anúncios.

Não precisa de conta na TypeSafe nem de lista de espera: a chave do OpenRouter já dá acesso ao JEV.

---

## Como baixar

**Opção 1: pelo site (mais fácil)**

1. No topo desta página, clique no botão verde **`<> Code`**.
2. Clique em **Download ZIP**.
3. Extraia o ZIP numa pasta **que você não vai apagar**, por exemplo `Documentos/cacador-de-anuncios`.

> ⚠️ O Chrome lê a extensão direto dessa pasta. Se você apagar ou mover a pasta, a extensão para de funcionar.

**Opção 2: com git**

```bash
git clone https://github.com/vibecodingelite-ai/cacador-de-anuncios.git
```

---

## Como instalar no Chrome

1. Abra uma aba e digite na barra de endereço: `chrome://extensions`
2. No canto superior direito, ligue o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Escolha a pasta que você extraiu, aquela que tem o arquivo `manifest.json` dentro.
5. O **Caçador de Anúncios** aparece na lista. Para deixar o ícone sempre visível, clique no quebra-cabeça 🧩 da barra do Chrome e fixe a extensão.

---

## Como criar e incluir a chave do OpenRouter

**1. Crie a chave**

1. Entre em [openrouter.ai](https://openrouter.ai) e faça login.
2. Em [Credits](https://openrouter.ai/settings/credits), adicione créditos.
3. Em [Keys](https://openrouter.ai/settings/keys), clique em **Create Key**.
   - Dê um nome, por exemplo "Caçador de Anúncios".
   - **Recomendado:** defina um **limite de crédito** (ex.: US$ 2). Assim, mesmo que algo dê errado, o gasto fica travado.
4. Copie a chave. Ela começa com `sk-or-`.

> 💡 Crie uma chave **só para esta extensão**, em vez de reaproveitar uma que você usa em outros projetos.

**2. Cole na extensão**

1. Clique no ícone do **Caçador de Anúncios** (ou, em `chrome://extensions`, clique em **Detalhes → Opções da extensão**).
2. Cole a chave no campo **Chave do OpenRouter**.
3. Clique em **Salvar**. Deve aparecer **✅ Chave salva.**

A chave nunca é mostrada de volta na tela. Para trocar, é só colar uma nova e salvar.

---

## Como configurar os seus nichos

Na mesma página de Opções, em **Meus nichos**:

1. Digite um nicho, por exemplo `renda extra`, e aperte **Enter**. Ele vira uma etiqueta.
2. Adicione até **3 nichos**. O limite existe para as respostas não ficarem ambíguas.
3. Para remover, clique no **×** da etiqueta.

Os nichos são salvos na hora.

**Dica:** nichos específicos funcionam melhor. `cursos de IA para empreendedores` dá respostas mais precisas que só `inteligência artificial`.

---

## Como usar

1. Abra a [Biblioteca de Anúncios](https://www.facebook.com/ads/library) e faça uma busca (por palavra-chave ou por anunciante).
2. **Role a página.** Cada card que aparece na tela ganha um selo: primeiro "⏳ JEV analisando…" e, menos de um segundo depois, o resultado.
3. Use o **painel** no canto direito para acompanhar, filtrar por nicho e exportar.

Se a aba da Biblioteca já estava aberta antes de instalar, recarregue a página.

---

## Como ler os selos

Exemplo de selo: `🔥 ESCALADO · desejo · ●●●○ · 86% · renda extra 80%`

| Parte | Significado |
|---|---|
| **Veredito** | Veja a tabela abaixo |
| **Ângulo** | O gatilho principal da copy: dor, desejo, prova social, oferta/urgência, curiosidade, autoridade ou nenhum claro |
| **Bolinhas** | A força do gancho da primeira frase: ●○○○ fraco, ●●○○ ok, ●●●○ forte, ●●●● muito forte |
| **%** | A chance de o anúncio estar dando resultado |
| **Nicho %** | O nicho que mais encaixou. Passe o mouse para ver todos |

Quando o JEV está pouco confiante no ângulo ou no gancho, o item aparece em *itálico* com um "?".

**Vereditos**

| Selo | Quando aparece | O que fazer |
|---|---|---|
| 🔥 **ESCALADO** | Chance de resultado ≥ 75% **e** encaixa em algum nicho seu (≥ 50%) | É o que você procura: está funcionando e serve de modelo |
| 📌 **ESCALADO · fora do nicho** | Chance ≥ 75%, mas não encaixa em nenhum nicho | Funciona em outro mercado. Pode inspirar o formato |
| ❔ **INCERTO** | Chance entre 40% e 75% | O JEV está em dúvida; os sinais estão no meio-termo |
| 🧪 **TESTE** | Chance abaixo de 40% | Provavelmente o anunciante ainda está testando: pouco tempo no ar, uma versão só |

A chance de resultado leva em conta os sinais públicos da Biblioteca: **dias no ar**, **quantos anúncios usam o mesmo criativo**, **várias versões** e **número de plataformas**, junto com a qualidade da copy. Anunciante não paga por semanas seguidas um anúncio que não converte.

---

## Painel, filtros e exportação

O painel fica no canto direito da Biblioteca. Clique no título para recolher.

- **Chips de nicho:** cada chip mostra quantos anúncios servem para aquele nicho e quantos estão escalados (ex.: `renda extra 3 · 🔥2`). **Clique num chip** para apagar os cards dos outros nichos. Clique de novo para voltar.
- **Anúncios lidos, decisões do JEV, tempo médio por decisão e custo total** da sessão.
- **Exportar CSV:** planilha separada por `;` (abre direto no Excel em português), com todos os dados e uma coluna de % por nicho.
- **Relatório PDF:** abre um relatório formatado, com os escalados primeiro, e o diálogo de impressão. Escolha **Salvar como PDF**.

Com um chip ativo, os dois exports saem **só com os anúncios daquele nicho**.

---

## Custos

- O JEV cobra **só pelos tokens de entrada**, e a resposta é grátis. Preço atual: **US$ 0,042 por 1 milhão de tokens** (confira na [página do modelo](https://openrouter.ai/typesafe/jev-1.13)).
- Cada anúncio usa cerca de **1.300 tokens**, ou seja, uns **US$ 0,00005**.
- O custo de cada chamada vem da própria API (campo `usage.cost`) e é somado no painel.
- **Cache:** cada anúncio é analisado uma vez por conjunto de nichos. Recarregar a página ou voltar à mesma busca não gasta de novo. Trocar os nichos gera uma nova análise.

Acompanhe o gasto real em [openrouter.ai/activity](https://openrouter.ai/activity).

---

## Segurança da chave

- A chave fica guardada **só no `chrome.storage.local` do seu navegador**. Não vai para nenhum servidor além do próprio OpenRouter.
- Quem usa a chave é apenas o *service worker* da extensão (`background.js`). **A página do Facebook nunca tem acesso a ela.**
- A chave não aparece no código, no console nem na tela de Opções.
- Este repositório **não contém nenhuma chave**. Cada pessoa usa a sua.

Boas práticas: use uma chave só para a extensão, com limite de crédito, e apague a chave no OpenRouter se não for mais usar.

---

## Como atualizar

1. Baixe a versão nova (ZIP ou `git pull`) **na mesma pasta**.
2. Em `chrome://extensions`, clique no **↻** do Caçador de Anúncios.
3. Recarregue a aba da Biblioteca.

A chave e os nichos continuam salvos.

---

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Nenhum selo aparece | Recarregue a aba da Biblioteca. Confira se a extensão está ativada em `chrome://extensions` |
| "Chave do OpenRouter não configurada" | Cole a chave nas Opções e clique em Salvar |
| "Chave inválida ou ausente" | A chave foi apagada ou digitada errada. Crie outra no OpenRouter |
| "Sem créditos no OpenRouter" | Adicione créditos em [Credits](https://openrouter.ai/settings/credits) |
| "Extensão recarregada. Atualize a página." | Você clicou no ↻ da extensão; recarregue a aba |
| Aviso "Campo … não encontrado em X cards" | A Meta mudou o texto da página. O aviso mostra o texto encontrado; abra uma *issue* com ele |
| Plataforma "não identificada" | A Meta trocou os ícones das plataformas. O resto continua funcionando |
| Selo com ⚠️ | Clique no selo para tentar de novo |

---

## Como funciona por dentro

```
Biblioteca de Anúncios (content.js)          Service worker (background.js)        OpenRouter
─────────────────────────────────           ──────────────────────────────        ──────────
acha os cards pelo texto visível  ──ad──►   lê a chave do chrome.storage   ──►   POST /api/alpha/decisions
extrai só o que está na tela                monta as perguntas                    model: typesafe/jev-1.13
aplica as regras e desenha o selo ◄─answers─ devolve respostas, custo e ms  ◄──   answers + usage.cost
```

- **Rota:** `POST https://openrouter.ai/api/alpha/decisions` (a rota de decisões, não a de chat), conforme a [documentação oficial](https://openrouter.ai/docs/guides/community/jev).
- **Uma chamada por anúncio**, com todas as perguntas juntas: `escalado` (noul), `angulo` (choice), `gancho` (score) e `nicho_0..2` (noul).
- **Regras em código** (`content.js` → `RULES`): ESCALADO ≥ 0,75, NICHO ≥ 0,5, TESTE < 0,40, confiança baixa < 0,5. Ajuste à vontade.
- **Por que INCERTO é 0,40–0,75:** respostas noul não têm campo de confiança; a dúvida do modelo aparece como probabilidade perto de 0,5.
- **Seletores:** a Meta usa classes CSS que mudam o tempo todo, então os cards são achados pelo **texto visível** ("Identificação da biblioteca", "Library ID", "Patrocinado", "Plataformas"…).
- **Sem LLM de texto.** Toda decisão é do JEV.

**Arquivos**

| Arquivo | Função |
|---|---|
| `manifest.json` | Configuração da extensão (Manifest V3) |
| `background.js` | Guarda o acesso à chave e chama a API do OpenRouter |
| `content.js` | Detecta e lê os cards, aplica as regras, desenha selos e painel, exporta |
| `content.css` | Estilo dos selos |
| `options.html` / `options.js` | Página de Opções (chave e nichos) |
| `report.html` / `report.js` | Relatório para salvar em PDF |

---

## Licença

[MIT](LICENSE). Use, modifique e compartilhe à vontade.

Este projeto não tem ligação com a Meta, a TypeSafe ou o OpenRouter. Ele só lê informações públicas da Biblioteca de Anúncios que já estão na sua tela.
