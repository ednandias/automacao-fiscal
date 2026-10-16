# Automação Fiscal

Emite notas fiscais de devolução no ZipHub a partir de planilhas `.xlsx` e grava o número de cada devolução de volta na planilha.

## Requisitos

- Node **22.20+** (a versão está no `.nvmrc`, então basta rodar `nvm use`)
- Yarn

```bash
nvm use
yarn install
```

## Comandos

| Comando | O que faz |
|---|---|
| `yarn dev` | Emite as devoluções das planilhas |
| `yarn gen-sheets` | Cria ou atualiza planilhas a partir de uma lista de notas |
| `yarn typecheck` | Verifica os tipos do TypeScript |
| `yarn lint` | Roda o ESLint em `src/` |

## Passo a passo

1. **Monte as planilhas** em `planilhas/`. Você pode usar `yarn gen-sheets` ou criar à mão (veja [Formato da planilha](#formato-da-planilha)).
2. **Feche as planilhas** no Excel/LibreOffice.
3. Rode `yarn dev` e responda às perguntas.
4. No fim, leia o resumo e trate as notas marcadas como `Erro` ou `VERIFICAR`.

## Formato da planilha

- **Pasta:** `planilhas/`, na raiz do projeto. Ela é criada automaticamente e o git ignora o conteúdo.
- **Nome do arquivo:** precisa começar com o prefixo da conta, como `ml1_...`, `ml2_...` e assim por diante. Exemplos: `ml1_sac.xlsx`, `ML3_outubro.xlsx`. Arquivos sem um prefixo reconhecido são ignorados.
- **Aba:** o bot usa só a primeira aba.
- **Cabeçalhos (linha 1):** `NFE` e `NFE_DEV` são obrigatórios. Se faltar algum, o arquivo é ignorado.

| NFE | NFE_DEV |
|---|---|
| 123456 | |
| 123457 | 98765 |
| 123458 | Erro |

- `NFE`: número da nota original.
- `NFE_DEV`: resultado. O bot preenche essa coluna (veja [Coluna NFE_DEV](#coluna-nfe_dev)).

Se a mesma NF aparecer em mais de uma linha, só a primeira é emitida.

> **Feche a planilha antes de rodar.** Se ela estiver aberta, o bot ignora o arquivo, porque salvar o Excel depois apagaria o que foi gravado.

## `yarn dev`: emitir devoluções

O bot faz três perguntas:

| Pergunta | Opções | Padrão |
|---|---|---|
| **Quais arquivos serão usados?** | Os `.xlsx` de `planilhas/` (marque com espaço e confirme com Enter) | — (escolha pelo menos um) |
| **Quantas notas o bot deve tentar emitir por arquivo?** | Um número inteiro. `0` emite todas | `0` |
| **Modo de operação** | **Padrão:** emite as notas com `NFE_DEV` vazio.<br>**Recuperação:** tenta de novo só as notas marcadas como `Erro` | Padrão |

Em qualquer modo, as linhas marcadas como `REEMITIR` também são processadas.

Para cada nota, o bot:

1. Confere o histórico local (`logs/emissoes.jsonl`). Se a nota já foi emitida, só grava o número na planilha.
2. Busca a nota original no ZipHub.
3. Espera um intervalo aleatório de 1 a 15 s entre emissões e aguarda a trava de geração do ZipHub ser liberada.
4. Cria a nota de devolução, ou reaproveita uma que já exista.
5. Pede a emissão e espera a resposta da SEFAZ.
6. Grava o número da devolução no histórico e na planilha.

No fim aparece um resumo por conta (emitidas, com erro e a verificar) e a lista das notas que precisam de atenção.

Para cancelar, use `Ctrl+C` durante as perguntas.

## `yarn gen-sheets`: gerar planilhas

1. Digite os números das notas separados por vírgula, por exemplo `123,456,789`.
2. Escolha o arquivo de destino (`ml1_sac.xlsx` a `ml5_sac.xlsx`, um por conta).
3. Se quiser, adicione mais notas.

O arquivo é criado se ainda não existir. Notas que já estão na planilha são ignoradas.

## Coluna NFE_DEV

| Valor | Significado | O bot... |
|---|---|---|
| *(vazio)* | Não processada | emite no modo **Padrão** |
| número | Devolução emitida | ignora |
| `Erro` | Falhou e **não** foi emitida | tenta de novo no modo **Recuperação** |
| `VERIFICAR` | Resultado incerto (ex.: timeout) | ignora. **Confira no ZipHub** |
| `REEMITIR` | Digitado à mão | força uma nova emissão, ignorando o histórico |

Depois de conferir uma nota `VERIFICAR` no ZipHub:

- se ela **foi** emitida, digite o número da devolução na célula;
- se **não** foi, digite `REEMITIR`.

## Configurações (`src/config.ts`)

Não há `.env`. Toda a configuração fica em `src/config.ts`:

| Constante | Valor atual | Para que serve |
|---|---|---|
| `SHEETS_DIR` | `planilhas/` | Pasta das planilhas de entrada |
| `LOGS_DIR` | `logs/` | Pasta dos logs e do histórico |
| `API_URL` | `https://node.ziphub.com.br` | Endereço da API do ZipHub |
| `MAIN_ACCOUNT` | `514066249` | Conta emissora usada em todas as chamadas |
| `USER_NAME` | `EDNAN T.I` | Nome que aparece como responsável pela emissão no ZipHub |
| `ACCOUNT_IDS` | `ML1`…`ML5` | Liga o prefixo do arquivo ao ID da conta |
| `TIMING.lockMaxWait` | 10 min | Tempo máximo esperando a trava de geração. Depois disso, o processo é interrompido |
| `TIMING.lockInterval` | 5 s | Intervalo entre as consultas à trava |
| `TIMING.jobAttempts` | 45 | Quantas vezes o bot consulta o resultado da SEFAZ |
| `TIMING.jobInterval` | 4 s | Intervalo entre essas consultas (45 × 4 s = 3 min antes de marcar `VERIFICAR`) |
| `STATUS` | `Erro`, `VERIFICAR`, `REEMITIR` | Textos usados na coluna `NFE_DEV` |

Contas atuais:

| Prefixo | ID |
|---|---|
| `ml1` | 514066249 |
| `ml2` | 699017946 |
| `ml3` | 751371366 |
| `ml4` | 1105949144 |
| `ml5` | 1468767285 |

**Para adicionar uma conta**, inclua uma linha em `ACCOUNT_IDS` (ex.: `ML6: "123456789"`) e nomeie a planilha como `ml6_....xlsx`. O `yarn gen-sheets` passa a oferecer `ml6_sac.xlsx` automaticamente.

Outros parâmetros fixos no código:

- Timeout de cada requisição: 60 s (`src/api/client.ts`).
- Requisições GET são repetidas até 3 vezes em caso de falha de rede, erro 5xx ou 429. Pedidos de emissão **nunca** são repetidos, para não emitir a mesma nota duas vezes.

## Logs

- `logs/error.txt`: erros de cada execução.
- `logs/emissoes.jsonl`: histórico de todo pedido de emissão. Se a planilha for sobrescrita, o bot usa esse histórico para restaurar os números sem emitir de novo. **Não apague esse arquivo.**

## Problemas comuns

| Mensagem | Solução |
|---|---|
| `Nenhuma planilha .xlsx encontrada` | Coloque os arquivos em `planilhas/` |
| `Conta não identificada pelo nome` | Renomeie o arquivo com o prefixo `ml1_`, `ml2_`... |
| `está aberto no Excel/LibreOffice` | Feche o arquivo. Se ele já estiver fechado, apague o arquivo de trava (`.~lock.*#` ou `~$*`) que sobrou na pasta |
| `Cabeçalho "NFE_DEV" não encontrado` | Adicione os cabeçalhos `NFE` e `NFE_DEV` na linha 1 |
| `EMISSÃO ANTERIOR SEM CONFIRMAÇÃO` | O histórico tem um pedido sem resposta. Confira no ZipHub e siga as instruções de `VERIFICAR` |
| Processo interrompido pela trava de geração | O ZipHub ficou bloqueado por mais de 10 min. Rode de novo mais tarde |

## Estrutura

```
src/
  index.ts                 CLI: perguntas e início do processo
  config.ts                contas, status, tempos e caminhos
  types.ts                 tipos das respostas da API
  api/
    client.ts              axios + retry (só GET)
    nfe.ts                 chamadas da API do ZipHub
  sheets/
    spreadsheet.ts         leitura e gravação das planilhas
  emission/
    runEmission.ts         o processo de emissão, nota a nota
    history.ts             histórico de emissões (emissoes.jsonl)
  scripts/
    genSheets.ts           gerador de planilhas
  utils/                   formatação, log e sleep
```
