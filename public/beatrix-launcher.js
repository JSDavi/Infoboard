// Abre as duas etapas do Beatrix no domínio oficial, em janela compacta.
// A interface de autenticação e toda a navegação são do próprio Beatrix.
// A barra de endereço/identidade do site é controlada pelo navegador e pode permanecer visível.
// Não replica formulários, não recebe senhas e não chama endpoints de operação NPX.
(() => {
  const link = document.getElementById('beatrix-login-btn');
  if (!link) return;

  link.addEventListener('click', event => {
    const availableWidth = window.screen?.availWidth || window.innerWidth || 560;
    const availableHeight = window.screen?.availHeight || window.innerHeight || 720;
    // Janela estreita, mas ainda suficiente para o formulário de acesso e a seleção da fila.
    const width = Math.min(520, Math.max(320, availableWidth - 32));
    const height = Math.min(760, Math.max(400, availableHeight - 32));
    const left = Math.max(0, Math.floor((availableWidth - width) / 2));
    const top = Math.max(0, Math.floor((availableHeight - height) / 2));
    // O Chrome pode ignorar flags de ocultação para preservar a identificação do site.
    const features = `popup=yes,width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no,resizable=yes,scrollbars=yes`;

    const popup = window.open(link.href, 'infoboard-beatrix-oficial', features);
    if (!popup) return; // Link HTML abre nova aba se o navegador bloquear popup.

    event.preventDefault();
    try {
      popup.opener = null;
      popup.focus();
    } catch {
      // O portal pertence a outra origem; falhas de foco não afetam a autenticação.
    }
  });
})();
