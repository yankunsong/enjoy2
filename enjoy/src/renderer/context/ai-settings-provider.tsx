import { createContext, useEffect, useState, useContext } from "react";
import {
  AppSettingsProviderContext,
  DbProviderContext,
} from "@renderer/context";
import { SttEngineOptionEnum, UserSettingKeyEnum } from "@/types/enums";
import { GPT_PROVIDERS, TTS_PROVIDERS } from "@renderer/components";
import { isLocalWebEnjoy } from "@/distribution";
import { fetchElevenLabsVoices } from "@renderer/lib/elevenlabs";
import log from "electron-log/renderer";

const logger = log.scope("ai-settings-provider.tsx");

type AISettingsProviderState = {
  sttEngine?: SttEngineOptionEnum;
  setSttEngine?: (name: string) => Promise<void>;
  openai?: LlmProviderType;
  setOpenai?: (config: LlmProviderType) => void;
  azureSpeech?: AzureSpeechConfigType;
  setAzureSpeech?: (config: AzureSpeechConfigType) => Promise<void>;
  elevenlabs?: ElevenLabsConfigType;
  setElevenlabs?: (config: ElevenLabsConfigType) => Promise<void>;
  setGptEngine?: (engine: GptEngineSettingType) => void;
  currentGptEngine?: GptEngineSettingType;
  gptProviders?: typeof GPT_PROVIDERS;
  ttsProviders?: typeof TTS_PROVIDERS;
  ttsConfig?: TtsConfigType;
  setTtsConfig?: (config: TtsConfigType) => Promise<void>;
};

const initialState: AISettingsProviderState = {};

export const AISettingsProviderContext =
  createContext<AISettingsProviderState>(initialState);

export const AISettingsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { EnjoyApp, libraryPath, user, apiUrl, webApi, learningLanguage } =
    useContext(AppSettingsProviderContext);
  const [gptProviders, setGptProviders] = useState<any>(GPT_PROVIDERS);
  const [ttsProviders, setTtsProviders] = useState<any>(TTS_PROVIDERS);
  const db = useContext(DbProviderContext);

  // OpenAI, so that Transcription runs on the user's own key rather than on a
  // token Hosted Enjoy hands out to an account.
  const [sttEngine, setSttEngine] = useState<SttEngineOptionEnum>(
    SttEngineOptionEnum.OPENAI
  );
  const [ttsConfig, setTtsConfig] = useState<TtsConfigType>(null);
  const [gptEngine, setGptEngine] = useState<GptEngineSettingType>({
    name: "enjoyai",
    models: {
      default: "gpt-4o",
    },
  });
  const [openai, setOpenai] = useState<LlmProviderType>(null);
  // Assessment's own credentials. Empty until the user fills them in, which is
  // the state `use-pronunciation-assessments` reports rather than fails on.
  const [azureSpeech, setAzureSpeech] = useState<AzureSpeechConfigType>(null);
  // Speech synthesis runs on the user's own ElevenLabs account, on the same
  // terms: empty until filled in, and `use-speech` says so rather than failing
  // somewhere further in.
  const [elevenlabs, setElevenlabs] = useState<ElevenLabsConfigType>(null);

  const refreshGptProviders = async () => {
    let providers = GPT_PROVIDERS;

    try {
      const config = await webApi.config("gpt_providers");
      providers = Object.assign(providers, config);
    } catch (e) {
      console.warn(`Failed to fetch remote GPT config: ${e.message}`);
    }

    try {
      const response = await fetch(providers["ollama"]?.baseUrl + "/api/tags");
      providers["ollama"].models = (await response.json()).models.map(
        (m: any) => m.name
      );
    } catch (e) {
      console.warn(`No ollama server found: ${e.message}`);
    }

    if (openai?.models) {
      providers["openai"].models = openai.models.split(",");
    }

    setGptProviders({ ...providers });
  };

  const refreshTtsProviders = async () => {
    let providers = TTS_PROVIDERS;

    try {
      const config = await webApi.config("tts_providers_v2");
      providers = Object.assign(providers, config);
    } catch (e) {
      console.warn(`Failed to fetch remote TTS config: ${e.message}`);
    }

    // The voices an ElevenLabs key can actually reach, which is the only place
    // that list exists — see the note beside the empty array in TTS_PROVIDERS.
    if (elevenlabs?.key) {
      try {
        providers["elevenlabs"].voices = await fetchElevenLabsVoices(
          elevenlabs.key
        );
      } catch (e) {
        console.warn(`Failed to fetch ElevenLabs voices: ${e.message}`);
      }
    }

    setTtsProviders({ ...providers });
  };

  const DEFAULT_TTS_CONFIG = (): TtsConfigType => ({
    engine: "elevenlabs",
    model: "eleven_multilingual_v2",
    // No default: an ElevenLabs voice id is account-specific, so there is no
    // name to guess. The list arrives with the key.
    voice: "",
    language: learningLanguage,
  });

  const refreshTtsConfig = async () => {
    let config = await EnjoyApp.userSettings.get(UserSettingKeyEnum.TTS_CONFIG);

    if (!config) {
      config = DEFAULT_TTS_CONFIG();
      EnjoyApp.userSettings.set(UserSettingKeyEnum.TTS_CONFIG, config);
    } else if (isLocalWebEnjoy && config.engine === "enjoyai") {
      // A stored engine that cannot run here, the same case the STT setting
      // handles above: `enjoyai` proxies both OpenAI and Azure through an
      // account this distribution does not have. Left alone it fails at the
      // point of use, several steps from the setting that caused it, so it is
      // rewritten to the default rather than merely ignored.
      config = DEFAULT_TTS_CONFIG();
      EnjoyApp.userSettings.set(UserSettingKeyEnum.TTS_CONFIG, config);
    }

    setTtsConfig(config);
  };

  const handleSetTtsConfig = async (config: TtsConfigType) => {
    return EnjoyApp.userSettings
      .set(UserSettingKeyEnum.TTS_CONFIG, config)
      .then(() => {
        setTtsConfig(config);
      });
  };

  useEffect(() => {
    refreshGptProviders();
    refreshTtsProviders();
  }, [openai, gptEngine, elevenlabs]);

  useEffect(() => {
    if (db.state !== "connected") return;

    fetchSettings();
  }, [db.state]);

  useEffect(() => {
    if (db.state !== "connected") return;
    if (!libraryPath) return;
  }, [db.state, libraryPath]);

  const handleSetSttEngine = async (name: SttEngineOptionEnum) => {
    setSttEngine(name);
    return EnjoyApp.userSettings.set(UserSettingKeyEnum.STT_ENGINE, name);
  };

  const fetchSettings = async () => {
    const _sttEngine = await EnjoyApp.userSettings.get(
      UserSettingKeyEnum.STT_ENGINE
    );
    if (Object.values(SttEngineOptionEnum).includes(_sttEngine)) {
      setSttEngine(_sttEngine);
    } else if (_sttEngine) {
      // A stored engine that no longer exists — the local one, retired with its
      // model downloads. Left as it is, the select renders blank and
      // Transcription falls through to a branch the user did not pick, so it is
      // rewritten to the default rather than merely ignored.
      handleSetSttEngine(SttEngineOptionEnum.OPENAI);
    }

    const _openai = await EnjoyApp.userSettings.get(UserSettingKeyEnum.OPENAI);
    if (_openai) {
      setOpenai(Object.assign({ name: "openai" }, _openai));
    }

    const _azureSpeech = await EnjoyApp.userSettings.get(
      UserSettingKeyEnum.AZURE_SPEECH
    );
    if (_azureSpeech) {
      setAzureSpeech(_azureSpeech);
    }

    const _elevenlabs = await EnjoyApp.userSettings.get(
      UserSettingKeyEnum.ELEVENLABS
    );
    if (_elevenlabs) {
      setElevenlabs(_elevenlabs);
    }

    const _gptEngine = await EnjoyApp.userSettings.get(
      UserSettingKeyEnum.GPT_ENGINE
    );
    if (_gptEngine && !(isLocalWebEnjoy && _gptEngine.name === "enjoyai")) {
      setGptEngine(_gptEngine);
    } else if (_openai?.key || isLocalWebEnjoy) {
      // `enjoyai` is the engine a first run stores before any key has arrived,
      // and it outlives the key: the stored value is read back first, so a
      // later `OPENAI_API_KEY` never dislodges it. Here that engine has no
      // account behind it, and the commands built on it — translate, analyze,
      // lookup — go out with an undefined key to Hosted Enjoy's `/api/ai` and
      // come back saying the OpenAI key is missing, which is a true sentence
      // about the wrong setting. So the same rewrite the STT engine and the
      // TTS config already do: replace it with the one engine this
      // distribution can run, rather than ignore it and fail at the point of
      // use. Without a key that engine still fails, but it fails naming the
      // key the user has to set.
      const engine = {
        name: "openai",
        models: {
          default: "gpt-4o",
        },
      };
      EnjoyApp.userSettings
        .set(UserSettingKeyEnum.GPT_ENGINE, engine)
        .then(() => {
          setGptEngine(engine);
        });
    } else {
      const engine = {
        name: "enjoyai",
        models: {
          default: "gpt-4o",
        },
      };
      EnjoyApp.userSettings
        .set(UserSettingKeyEnum.GPT_ENGINE, engine)
        .then(() => {
          setGptEngine(engine);
        });
    }

    refreshTtsConfig();
  };

  const handleSetAzureSpeech = async (config: AzureSpeechConfigType) => {
    await EnjoyApp.userSettings.set(UserSettingKeyEnum.AZURE_SPEECH, config);
    setAzureSpeech(config);
  };

  const handleSetElevenlabs = async (config: ElevenLabsConfigType) => {
    await EnjoyApp.userSettings.set(UserSettingKeyEnum.ELEVENLABS, config);
    setElevenlabs(config);
  };

  const handleSetOpenai = async (config: LlmProviderType) => {
    await EnjoyApp.userSettings.set(UserSettingKeyEnum.OPENAI, config);
    setOpenai(Object.assign({ name: "openai" }, config));
  };

  return (
    <AISettingsProviderContext.Provider
      value={{
        setGptEngine: (engine: GptEngineSettingType) => {
          EnjoyApp.userSettings
            .set(UserSettingKeyEnum.GPT_ENGINE, engine)
            .then(() => {
              setGptEngine(engine);
            });
        },
        currentGptEngine:
          gptEngine.name === "openai"
            ? Object.assign(gptEngine, {
                // Optional, because the engine can now be selected while the
                // settings behind it are still empty: the rewrite above picks
                // it on a key's behalf that has not arrived yet. An undefined
                // key reaches the command and is reported there; reading it
                // off `null` here would take the whole provider down first.
                key: openai?.key,
                baseUrl: openai?.baseUrl,
              })
            : Object.assign(gptEngine, {
                key: user?.accessToken,
                baseUrl: `${apiUrl}/api/ai`,
              }),
        openai,
        setOpenai: (config: LlmProviderType) => handleSetOpenai(config),
        azureSpeech,
        setAzureSpeech: (config: AzureSpeechConfigType) =>
          handleSetAzureSpeech(config),
        elevenlabs,
        setElevenlabs: (config: ElevenLabsConfigType) =>
          handleSetElevenlabs(config),
        sttEngine,
        setSttEngine: (name: SttEngineOptionEnum) => handleSetSttEngine(name),
        ttsConfig,
        setTtsConfig: (config: TtsConfigType) => handleSetTtsConfig(config),
        gptProviders,
        ttsProviders,
      }}
    >
      {children}
    </AISettingsProviderContext.Provider>
  );
};
