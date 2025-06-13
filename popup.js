
    document.getElementById("scanButton").addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const externalOnly = document.getElementById("externalOnly").checked;
      document.getElementById("loadingMessage").classList.remove("hidden");
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scanPage,
        args: [externalOnly]
      });
    });

    function scanPage(externalOnly) {
      const hasCookies = document.cookie && document.cookie.length > 0;
      chrome.runtime.sendMessage({ type: "cookies", value: hasCookies });

      const faviconLink = document.querySelector("link[rel~='icon']");
      const hasFavicon = faviconLink && faviconLink.href;
      chrome.runtime.sendMessage({ type: "favicon", value: hasFavicon, url: hasFavicon ? faviconLink.href : null });

      const links = Array.from(document.querySelectorAll("a[href]")).map(a => a.href);
      const currentDomain = window.location.hostname;

      let filteredLinks = externalOnly
        ? links.filter(link => {
            try {
              const url = new URL(link);
              return url.hostname !== currentDomain;
            } catch (e) {
              return false;
            }
          })
        : links;

      if (filteredLinks.length === 0) {
        chrome.runtime.sendMessage({ type: "links", valid: 0, invalid: 0, invalidLinks: [] });
        return;
      }

      const batchSize = 10;
      let brokenLinks = [];

      (async () => {
        for (let i = 0; i < filteredLinks.length; i += batchSize) {
          const batch = filteredLinks.slice(i, i + batchSize);
          const results = await Promise.allSettled(
            batch.map(link => fetch(link, { method: 'HEAD' }).then(response => {
              if (!response.ok) {
                brokenLinks.push(link);
              }
            }).catch(error => {
              brokenLinks.push(link);
            }))
          );
        }

        chrome.runtime.sendMessage({
          type: "links",
          valid: filteredLinks.length - brokenLinks.length,
          invalid: brokenLinks.length,
          invalidLinks: brokenLinks
        });
      })();
    }

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "favicon") {
        const el = document.getElementById("faviconResult");
        if (message.value) {
          el.className = "result ok";
          el.innerHTML = "✔️ Tiene favicon<br><img src='" + message.url + "' alt='favicon' style='margin-top: 5px; width: 32px; height: 32px;'>";
        } else {
          el.className = "result fail";
          el.textContent = "❌ No tiene favicon";
        }
      } else if (message.type === "cookies") {
        const el = document.getElementById("cookiesResult");
        if (message.value) {
          el.className = "result ok";
          el.textContent = "✔️ Sí hay cookies";
        } else {
          el.className = "result fail";
          el.textContent = "❌ No hay cookies";
        }
      } else if (message.type === "links") {
        document.getElementById("loadingMessage").classList.add("hidden");

        document.getElementById("validCount").textContent = message.valid;
        document.getElementById("invalidCount").textContent = message.invalid;

        const list = document.getElementById("invalidList");
        const copyBtn = document.getElementById("copyInvalid");
        list.innerHTML = "";
        message.invalidLinks.forEach(url => {
          const a = document.createElement("a");
          a.href = url;
          a.textContent = url;
          a.target = "_blank";
          list.appendChild(a);
        });

        if (message.invalid > 0) {
          document.getElementById("toggleInvalid").style.display = "inline";
          copyBtn.classList.remove("hidden");
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(message.invalidLinks.join('\n'));
          };
        } else {
          document.getElementById("toggleInvalid").style.display = "none";
          copyBtn.classList.add("hidden");
        }
      }
    });

    document.getElementById("toggleInvalid").addEventListener("click", () => {
      const list = document.getElementById("invalidList");
      list.classList.toggle("hidden");
      const btn = document.getElementById("toggleInvalid");
      btn.textContent = list.classList.contains("hidden") ? "▼" : "▲";
    });
    