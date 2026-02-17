/**
 * @fileoverview Early injection script for request interception.
 * Intercepts YouTube Music API requests to extract song metadata and timing information.
 */

/** Store reference to original fetch function */
const originalFetch = window.fetch;

/**
 * Overrides the global fetch function to intercept YouTube Music API requests.
 * Extracts and dispatches song data for lyrics synchronization.
 *
 * @param {string|Request} request - Fetch request URL or Request object
 * @param {RequestInit} [init] - Optional fetch configuration
 * @returns {Promise<Response>} The original fetch response
 */
window.fetch = async function (request, init) {
  const urlString = typeof request === "string" ? request : request.url;

  if (
    urlString.startsWith("https://music.youtube.com/youtubei/v1/browse") ||
    urlString.startsWith("https://music.youtube.com/youtubei/v1/next")
  ) {
    try {
      const requestToFetch = typeof request === "string" ? request : request.clone();
      const originalRequestForJson = typeof request === "string" ? new Request(request, init) : request.clone();

      // Determine the request method to avoid reading body of GET requests
      const method = originalRequestForJson.method || (init && init.method) || "GET";

      const response = await originalFetch(requestToFetch, init);
      const clonedResponseForJson = response.clone();

      // Only read the request body if it's a POST request
      let requestBodyPromise;
      if (method.toUpperCase() === "POST") {
        const contentEncoding = originalRequestForJson.headers.get("content-encoding");
        if (
          (contentEncoding === "gzip" || contentEncoding === "deflate") &&
          typeof DecompressionStream !== "undefined"
        ) {
          requestBodyPromise = originalRequestForJson
            .arrayBuffer()
            .then(async buffer => {
              try {
                const ds = new DecompressionStream(contentEncoding);
                const decompressedStream = new Response(buffer).body.pipeThrough(ds);
                return await new Response(decompressedStream).text();
              } catch (e) {
                console.error("Better Lyrics: Error decompressing request body:", e);
                return "{}";
              }
            })
            .catch(e => {
              console.error("Better Lyrics: Error reading request arrayBuffer:", e);
              return "{}";
            });
        } else {
          requestBodyPromise = originalRequestForJson.text().catch(e => {
            console.error("Better Lyrics: Error reading request text:", e);
            return "{}";
          });
        }
      } else {
        // For GET or other methods, resolve immediately with an empty object string
        requestBodyPromise = Promise.resolve("{}");
      }

      Promise.all([
        requestBodyPromise,
        clonedResponseForJson.text().catch(e => {
          console.error("Better Lyrics: Error reading response text:", e);
          return "{}";
        }),
      ])
        .then(awaitedTexts => {
          let requestJson, responseJson;
          try {
            // No need to parse requestJson if it wasn't a POST, but the empty object handles it gracefully
            requestJson = JSON.parse(awaitedTexts[0]);
          } catch (e) {
            console.error("Better Lyrics: Error parsing request JSON for URL:", urlString, e);
            requestJson = { error: "Failed to parse request JSON" };
          }
          try {
            responseJson = JSON.parse(awaitedTexts[1]);
          } catch (e) {
            console.error(
              "Better Lyrics: Error parsing response JSON for URL:",
              clonedResponseForJson.url || urlString,
              e
            );
            responseJson = { error: "Failed to parse response JSON" };
          }

          const event = new CustomEvent("blyrics-send-response", {
            detail: {
              url: clonedResponseForJson.url || urlString,
              requestJson: requestJson,
              responseJson: responseJson,
              status: clonedResponseForJson.status,
              timestamp: Date.now(),
            },
          });
          document.dispatchEvent(event);
        })
        .catch(error => {
          console.error(
            "Better Lyrics: Error in Promise.all processing:",
            error,
            clonedResponseForJson.url || urlString
          );
        });

      return response; // Return the original response fetched
    } catch (error) {
      console.error("Better Lyrics: Error in fetch wrapper for URL:", urlString, error);
      return originalFetch(request, init); // Fallback to original fetch on error
    }
  } else {
    return originalFetch(request, init);
  }
};
