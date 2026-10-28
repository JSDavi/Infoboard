// Identificação discreta da versão realmente instalada nesta instância.
document.addEventListener('DOMContentLoaded', async () => {
  const label = document.getElementById('app-version');
  if (!label) return;
  const refresh = async () => {
    try {
      const response = await fetch('/api/version', { cache: 'no-store' });
      if (!response.ok) throw new Error('Versão indisponível');
      const data = await response.json();
      if (!/^\d+\.\d+\.\d+$/.test(data.version)) throw new Error('Versão inválida');

      label.textContent = `Versão ${data.version}`;
      let detail = 'Data da instalação ainda não registrada';
      if (typeof data.installedAt === 'string') {
        const date = new Date(data.installedAt);
        if (Number.isFinite(date.getTime())) {
          const formatted = new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
          }).format(date).replace(', ', ' às ');
          detail = `Instalado/atualizado em ${formatted}`;
        }
      }
      label.title = detail;
      label.setAttribute('aria-label', `Versão ${data.version}. ${detail}`);
    } catch {
      // O HTML já traz a versão do pacote publicado. Uma falha de rede não
      // deve apagá-la; somente a data precisa da resposta do servidor.
      label.title = 'Não foi possível consultar a data de instalação nesta instância';
      label.setAttribute('aria-label', `${label.textContent}. ${label.title}`);
    }
  };
  await refresh();
  // Uma TV pode ficar aberta durante a troca do pacote. Atualizar o texto e
  // o tooltip sem exigir recarga manual da página.
  if (typeof setInterval === 'function') setInterval(refresh, 60_000);
});
