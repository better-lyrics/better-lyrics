import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import initializeRequestInterceptor from "../../../../public/earlyInject.js";

type RequestSnifferModule = typeof import("./requestSniffer");

const VIDEO_ID = "replay-video";
const BROWSE_ID = "MPLYt_replay-video";
const LYRICS = "Recovered after hot reload";
const SOURCE = "Provided to YouTube by Replay Records";

function requestSnifferGeneration(generation: string): Promise<RequestSnifferModule> {
  const moduleUrl = new URL("./requestSniffer.ts", import.meta.url);
  moduleUrl.searchParams.set("generation", generation);
  return import(moduleUrl.href) as Promise<RequestSnifferModule>;
}

function nextResponse() {
  return {
    contents: {
      singleColumnMusicWatchNextResultsRenderer: {
        tabbedRenderer: {
          watchNextTabbedResultsRenderer: {
            tabs: [
              {
                tabRenderer: {
                  content: {
                    musicQueueRenderer: {
                      content: {
                        playlistPanelRenderer: {
                          contents: [
                            {
                              playlistPanelVideoRenderer: {
                                videoId: VIDEO_ID,
                                title: { runs: [{ text: "Replay Song" }] },
                                longBylineText: {
                                  runs: [
                                    {
                                      text: "Replay Artist",
                                      navigationEndpoint: {
                                        browseEndpoint: {
                                          browseId: "UC-replay-artist",
                                          browseEndpointContextSupportedConfigs: {
                                            browseEndpointContextMusicConfig: {
                                              pageType: "MUSIC_PAGE_TYPE_ARTIST",
                                            },
                                          },
                                        },
                                      },
                                    },
                                  ],
                                },
                                lengthText: { runs: [{ text: "3:00" }] },
                                thumbnail: {
                                  thumbnails: [{ url: "https://example.com/replay.jpg", width: 128, height: 128 }],
                                },
                              },
                            },
                          ],
                        },
                      },
                    },
                  },
                },
              },
              {
                tabRenderer: {
                  endpoint: { browseEndpoint: { browseId: BROWSE_ID } },
                },
              },
            ],
          },
        },
      },
    },
  };
}

function browseResponse() {
  return {
    contents: {
      sectionListRenderer: {
        contents: [
          {
            musicDescriptionShelfRenderer: {
              description: { runs: [{ text: LYRICS }] },
              footer: { runs: [{ text: SOURCE }] },
            },
          },
        ],
      },
    },
  };
}

async function settleRequestProcessing(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
  await Promise.resolve();
}

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: `https://music.youtube.com/watch?v=${VIDEO_ID}`,
});
const testWindow = dom.window as unknown as Window & typeof globalThis;

Object.assign(globalThis, {
  window: testWindow,
  document: testWindow.document,
  CustomEvent: testWindow.CustomEvent,
  Event: testWindow.Event,
});

let networkRequestCount = 0;
const originalFetch = async (request: string | URL | Request): Promise<Response> => {
  networkRequestCount += 1;
  const url = typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
  const responseJson = url.includes("/next") ? nextResponse() : browseResponse();
  return new Response(JSON.stringify(responseJson), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
testWindow.fetch = originalFetch as typeof fetch;

const firstInterceptorCleanup = initializeRequestInterceptor();
const firstSniffer = await requestSnifferGeneration("before-hot-reload");
const firstSnifferCleanup = firstSniffer.setupRequestSniffer();

await testWindow.fetch("https://music.youtube.com/youtubei/v1/next", {
  method: "POST",
  body: JSON.stringify({ videoId: VIDEO_ID, context: { client: { hl: "en" } } }),
});
await testWindow.fetch("https://music.youtube.com/youtubei/v1/browse", {
  method: "POST",
  body: JSON.stringify({ browseId: BROWSE_ID }),
});
await settleRequestProcessing();

assert.deepEqual(
  await firstSniffer.getLyrics(VIDEO_ID, 0),
  { hasLyrics: true, lyrics: LYRICS, sourceText: SOURCE },
  "Given intercepted requests, When the first content-script generation reads lyrics, Then its parsed cache is populated"
);
assert.equal(networkRequestCount, 2);

firstSnifferCleanup();
firstInterceptorCleanup();

const secondInterceptorCleanup = initializeRequestInterceptor();
const secondSniffer = await requestSnifferGeneration("after-hot-reload");
const secondSnifferCleanup = secondSniffer.setupRequestSniffer();
await settleRequestProcessing();

assert.deepEqual(
  await secondSniffer.getLyrics(VIDEO_ID, 0),
  { hasLyrics: true, lyrics: LYRICS, sourceText: SOURCE },
  "Given a fresh content-script generation, When it requests replay, Then the page-world cache restores its lyrics"
);
assert.equal(
  networkRequestCount,
  2,
  "Given a replay after hot reload, When the fresh sniffer is restored, Then no YouTube request is repeated"
);

secondSnifferCleanup();
secondInterceptorCleanup();
assert.equal(testWindow.fetch, originalFetch, "Given interceptor cleanup, Then the page's original fetch is restored");

console.log("Request-sniffer replay selfcheck passed");
