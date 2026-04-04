import React, { useEffect, useMemo, useState } from "react";
import { COUNTRY_FLAGS } from "./countryFlags";

const API_HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

const POSITION_OPTIONS = ["GR", "DEF", "MED", "ATA"];
const DEFAULT_PLAYER = { name: "", position: "MED", country: "🇵🇹" };

function createEmptyTeam() {
  return {
    name: "Nova Equipa",
    division: 5,
    colors: { primary: "#0f172a", secondary: "#f8fafc" },
    stadium: { name: "Novo Estádio", capacity: 2500 },
    manager: { name: "Novo Treinador" },
    players: [
      { name: "Guarda-Redes", position: "GR", country: "🇵🇹" },
      { name: "Defesa 1", position: "DEF", country: "🇵🇹" },
      { name: "Defesa 2", position: "DEF", country: "🇵🇹" },
      { name: "Defesa 3", position: "DEF", country: "🇵🇹" },
      { name: "Defesa 4", position: "DEF", country: "🇵🇹" },
      { name: "Médio 1", position: "MED", country: "🇵🇹" },
      { name: "Médio 2", position: "MED", country: "🇵🇹" },
      { name: "Médio 3", position: "MED", country: "🇵🇹" },
      { name: "Médio 4", position: "MED", country: "🇵🇹" },
      { name: "Médio 5", position: "MED", country: "🇵🇹" },
      { name: "Avançado 1", position: "ATA", country: "🇵🇹" },
      { name: "Avançado 2", position: "ATA", country: "🇵🇹" },
    ],
  };
}

function createEmptyManager() {
  return { name: "" };
}

function createEmptyStadium() {
  return { name: "", capacity: 0 };
}

function createEmptyReferee() {
  return "";
}

function parseArrayResponse(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.teams)) return data.teams;
  return [];
}

function normalizeTeamDraft(team) {
  return {
    name: team?.name || "",
    division: Number(team?.division || 5),
    colors: {
      primary: team?.colors?.primary || "#0f172a",
      secondary: team?.colors?.secondary || "#f8fafc",
    },
    stadium: {
      name: team?.stadium?.name || "",
      capacity: Number(team?.stadium?.capacity || 0),
    },
    manager: {
      name: team?.manager?.name || "",
    },
    players: Array.isArray(team?.players)
      ? team.players.map((player) => ({
          name: player?.name || "",
          position: player?.position || "MED",
          country: player?.country || player?.nationality || "",
        }))
      : [],
  };
}

function AdminPanel({ token, username, onLogout }) {
  const [activeTab, setActiveTab] = useState("teams");
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("A carregar dados...");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reseedStatus, setReseedStatus] = useState("");
  const [teamSearch, setTeamSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [selectedTeamIndex, setSelectedTeamIndex] = useState(null);
  const [teams, setTeams] = useState([]);
  const [teamDraft, setTeamDraft] = useState(null);
  const [managers, setManagers] = useState([]);
  const [referees, setReferees] = useState([]);
  const [stadiums, setStadiums] = useState([]);

  const adminFetch = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...API_HEADERS(token),
        ...(options.headers || {}),
      },
    });

    if (response.status === 401) {
      onLogout();
      throw new Error("Sessão de admin expirada.");
    }

    return response;
  };

  const loadFixtures = async () => {
    setLoading(true);
    setError("");
    setLoadingMessage("A carregar fixtures...");

    try {
      const [teamsRes, managersRes, refereesRes, stadiumsRes] =
        await Promise.all([
          adminFetch("/admin/fixtures/all_teams"),
          adminFetch("/admin/fixtures/managers"),
          adminFetch("/admin/fixtures/referees"),
          adminFetch("/admin/fixtures/stadiums"),
        ]);

      const [teamsData, managersData, refereesData, stadiumsData] =
        await Promise.all([
          teamsRes.json(),
          managersRes.json(),
          refereesRes.json(),
          stadiumsRes.json(),
        ]);

      const nextTeams = Array.isArray(teamsData?.teams) ? teamsData.teams : [];
      setTeams(nextTeams);
      setManagers(parseArrayResponse(managersData));
      setReferees(parseArrayResponse(refereesData));
      setStadiums(parseArrayResponse(stadiumsData));
      setSelectedTeamIndex(nextTeams.length ? 0 : null);
      setTeamDraft(nextTeams.length ? normalizeTeamDraft(nextTeams[0]) : null);
    } catch (fetchError) {
      setError(fetchError.message || "Falha ao carregar dados de admin.");
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  useEffect(() => {
    loadFixtures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedTeamIndex === null) {
      setTeamDraft(null);
      return;
    }
    const selectedTeam = teams[selectedTeamIndex];
    if (!selectedTeam) {
      setTeamDraft(null);
      return;
    }
    setTeamDraft(normalizeTeamDraft(selectedTeam));
  }, [selectedTeamIndex, teams]);

  const filteredTeams = useMemo(() => {
    const query = teamSearch.trim().toLowerCase();
    return teams
      .map((team, index) => ({ team, index }))
      .filter(({ team }) => {
        const matchesSearch =
          !query ||
          [team.name, team.manager?.name, team.stadium?.name]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query));
        const matchesDivision =
          divisionFilter === "all" || String(team.division) === divisionFilter;
        return matchesSearch && matchesDivision;
      });
  }, [teams, teamSearch, divisionFilter]);

  const hasTeamDraft = Boolean(teamDraft);

  const updateTeamDraft = (patch) => {
    setTeamDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ...patch,
        colors: {
          ...prev.colors,
          ...(patch.colors || {}),
        },
        stadium: {
          ...prev.stadium,
          ...(patch.stadium || {}),
        },
        manager: {
          ...prev.manager,
          ...(patch.manager || {}),
        },
      };
    });
  };

  const updateTeamPlayer = (playerIndex, patch) => {
    setTeamDraft((prev) => {
      if (!prev) return prev;
      const nextPlayers = prev.players.map((player, index) =>
        index === playerIndex ? { ...player, ...patch } : player,
      );
      return { ...prev, players: nextPlayers };
    });
  };

  const addTeamPlayer = () => {
    setTeamDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, players: [...prev.players, { ...DEFAULT_PLAYER }] };
    });
  };

  const removeTeamPlayer = (playerIndex) => {
    setTeamDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        players: prev.players.filter((_, index) => index !== playerIndex),
      };
    });
  };

  const saveTeam = async () => {
    if (selectedTeamIndex === null || !teamDraft) return;
    setSaving(true);
    setError("");
    try {
      const response = await adminFetch(
        `/admin/fixtures/all_teams/team/${selectedTeamIndex}`,
        {
          method: "PUT",
          body: JSON.stringify(teamDraft),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Falha ao guardar equipa.");
      }
      await loadFixtures();
      setSelectedTeamIndex(data.index ?? selectedTeamIndex);
      setReseedStatus("Equipa guardada com sucesso.");
    } catch (saveError) {
      setError(saveError.message || "Falha ao guardar equipa.");
    } finally {
      setSaving(false);
    }
  };

  const addTeam = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await adminFetch("/admin/fixtures/all_teams/team", {
        method: "POST",
        body: JSON.stringify(createEmptyTeam()),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Falha ao adicionar equipa.");
      }
      await loadFixtures();
      setSelectedTeamIndex(data.index ?? teams.length);
      setReseedStatus("Nova equipa adicionada.");
    } catch (addError) {
      setError(addError.message || "Falha ao adicionar equipa.");
    } finally {
      setSaving(false);
    }
  };

  const deleteTeam = async () => {
    if (selectedTeamIndex === null) return;
    const current = teams[selectedTeamIndex];
    if (!current) return;
    const confirmed = window.confirm(
      `Remover a equipa ${current.name}? Esta ação não pode ser revertida.`,
    );
    if (!confirmed) return;

    setSaving(true);
    setError("");
    try {
      const response = await adminFetch(
        `/admin/fixtures/all_teams/team/${selectedTeamIndex}`,
        { method: "DELETE" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Falha ao remover equipa.");
      }
      await loadFixtures();
      setReseedStatus("Equipa removida.");
    } catch (deleteError) {
      setError(deleteError.message || "Falha ao remover equipa.");
    } finally {
      setSaving(false);
    }
  };

  const saveCollection = async (fileKey, nextValue, successMessage) => {
    setSaving(true);
    setError("");
    try {
      const response = await adminFetch(`/admin/fixtures/${fileKey}`, {
        method: "PUT",
        body: JSON.stringify(nextValue),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Falha ao guardar ficheiro.");
      }
      await loadFixtures();
      setReseedStatus(successMessage);
    } catch (saveError) {
      setError(saveError.message || "Falha ao guardar ficheiro.");
    } finally {
      setSaving(false);
    }
  };

  const addManager = () => {
    setManagers((prev) => [...prev, createEmptyManager()]);
  };

  const updateManager = (index, value) => {
    setManagers((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { name: value } : item,
      ),
    );
  };

  const removeManager = (index) => {
    setManagers((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const addReferee = () => {
    setReferees((prev) => [...prev, createEmptyReferee()]);
  };

  const updateReferee = (index, value) => {
    setReferees((prev) =>
      prev.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  };

  const removeReferee = (index) => {
    setReferees((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const addStadium = () => {
    setStadiums((prev) => [...prev, createEmptyStadium()]);
  };

  const updateStadium = (index, patch) => {
    setStadiums((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  };

  const removeStadium = (index) => {
    setStadiums((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const reseedDatabase = async () => {
    const confirmed = window.confirm(
      "Re-seed vai regenerar o base.db a partir dos fixtures atuais. Prosseguir?",
    );
    if (!confirmed) return;

    setSaving(true);
    setError("");
    setReseedStatus("A regenerar base.db...");

    try {
      const response = await adminFetch("/admin/reseed", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Falha ao re-seed.");
      }
      setReseedStatus("base.db regenerado com sucesso.");
    } catch (reseedError) {
      setError(reseedError.message || "Falha ao re-seed.");
      setReseedStatus("");
    } finally {
      setSaving(false);
    }
  };

  const renderTeamsTab = () => {
    const divisions = ["all", "1", "2", "3", "4", "5"];

    return (
      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="rounded-[28px] border border-white/8 bg-white/5 p-4 backdrop-blur-xl shadow-2xl shadow-black/20">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-semibold">
                Equipas
              </p>
              <h2 className="text-xl font-black text-white mt-1">
                Lista de clubes
              </h2>
            </div>
            <button
              type="button"
              onClick={addTeam}
              className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200 transition hover:bg-cyan-400/20"
            >
              Nova
            </button>
          </div>

          <div className="space-y-3 mb-4">
            <input
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              placeholder="Pesquisar equipa, treinador ou estádio"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/60"
            />
            <div className="flex flex-wrap gap-2">
              {divisions.map((division) => (
                <button
                  key={division}
                  type="button"
                  onClick={() => setDivisionFilter(division)}
                  className={`rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] transition ${divisionFilter === division ? "bg-white text-slate-950" : "bg-white/6 text-slate-300 hover:bg-white/12"}`}
                >
                  {division === "all" ? "Todas" : `Divisão ${division}`}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[70vh] space-y-3 overflow-auto pr-1">
            {filteredTeams.map(({ team, index }) => {
              const active = selectedTeamIndex === index;
              return (
                <button
                  key={`${team.name}-${index}`}
                  type="button"
                  onClick={() => setSelectedTeamIndex(index)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${active ? "border-cyan-400/60 bg-cyan-400/10" : "border-white/8 bg-slate-950/60 hover:border-white/16 hover:bg-white/8"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-black text-white">
                        {team.name}
                      </p>
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-400 mt-1">
                        Divisão {team.division}
                      </p>
                    </div>
                    <span
                      className="h-6 w-6 rounded-full border border-white/20"
                      style={{
                        backgroundColor: team.colors?.primary || "#000000",
                      }}
                    />
                  </div>
                  <p className="mt-3 text-sm text-slate-400">
                    {team.manager?.name} · {team.stadium?.name}
                  </p>
                </button>
              );
            })}
            {!filteredTeams.length && (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/60 p-6 text-sm text-slate-400">
                Nenhuma equipa encontrada.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/8 bg-white/5 p-6 backdrop-blur-xl shadow-2xl shadow-black/20">
          {!hasTeamDraft && (
            <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/60 p-8 text-sm text-slate-400">
              Seleciona uma equipa para editar.
            </div>
          )}

          {hasTeamDraft && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-semibold">
                    Editor de equipa
                  </p>
                  <h2 className="text-3xl font-black text-white mt-1">
                    {teamDraft.name}
                  </h2>
                  <p className="text-sm text-slate-400 mt-2">
                    Alterações afetam apenas novas salas criadas depois do
                    re-seed.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={saveTeam}
                    disabled={saving}
                    className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    Guardar equipa
                  </button>
                  <button
                    type="button"
                    onClick={deleteTeam}
                    disabled={saving}
                    className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:bg-slate-800"
                  >
                    Remover
                  </button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-semibold">
                    Nome
                  </span>
                  <input
                    value={teamDraft.name}
                    onChange={(e) => updateTeamDraft({ name: e.target.value })}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/60"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-semibold">
                    Divisão
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={teamDraft.division}
                    onChange={(e) =>
                      updateTeamDraft({ division: Number(e.target.value) })
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/60"
                  />
                </label>
                <label className="space-y-2 md:col-span-2 xl:col-span-1">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-semibold">
                    Treinador
                  </span>
                  <input
                    value={teamDraft.manager.name}
                    onChange={(e) =>
                      updateTeamDraft({ manager: { name: e.target.value } })
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/60"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-semibold">
                    Cor primária
                  </span>
                  <input
                    type="color"
                    value={teamDraft.colors.primary}
                    onChange={(e) =>
                      updateTeamDraft({ colors: { primary: e.target.value } })
                    }
                    className="h-12 w-full cursor-pointer rounded-2xl border border-white/10 bg-slate-950/80 p-2"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-semibold">
                    Cor secundária
                  </span>
                  <input
                    type="color"
                    value={teamDraft.colors.secondary}
                    onChange={(e) =>
                      updateTeamDraft({ colors: { secondary: e.target.value } })
                    }
                    className="h-12 w-full cursor-pointer rounded-2xl border border-white/10 bg-slate-950/80 p-2"
                  />
                </label>
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-2">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-semibold">
                      Pré-visualização
                    </span>
                    <div className="h-12 rounded-2xl border border-white/10 bg-slate-950/80 p-2">
                      <div
                        className="h-full rounded-xl"
                        style={{
                          background: `linear-gradient(90deg, ${teamDraft.colors.primary} 0%, ${teamDraft.colors.secondary} 100%)`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-semibold">
                    Estádio
                  </span>
                  <input
                    value={teamDraft.stadium.name}
                    onChange={(e) =>
                      updateTeamDraft({ stadium: { name: e.target.value } })
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/60"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-semibold">
                    Capacidade
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={teamDraft.stadium.capacity}
                    onChange={(e) =>
                      updateTeamDraft({
                        stadium: { capacity: Number(e.target.value) },
                      })
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/60"
                  />
                </label>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-semibold">
                      Jogadores
                    </p>
                    <h3 className="text-xl font-black text-white mt-1">
                      Tabela editável
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={addTeamPlayer}
                    className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/12"
                  >
                    Adicionar jogador
                  </button>
                </div>

                <div className="overflow-x-auto rounded-3xl border border-white/10 bg-slate-950/60">
                  <table className="min-w-full divide-y divide-white/8 text-sm">
                    <thead className="bg-white/5 text-left text-xs uppercase tracking-[0.24em] text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Nome</th>
                        <th className="px-4 py-3">Posição</th>
                        <th className="px-4 py-3">País</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/8">
                      {teamDraft.players.map((player, index) => (
                        <tr
                          key={`${player.name}-${index}`}
                          className="align-top"
                        >
                          <td className="px-4 py-3">
                            <input
                              value={player.name}
                              onChange={(e) =>
                                updateTeamPlayer(index, {
                                  name: e.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-white outline-none focus:border-cyan-400/60"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={player.position}
                              onChange={(e) =>
                                updateTeamPlayer(index, {
                                  position: e.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-white outline-none focus:border-cyan-400/60"
                            >
                              {POSITION_OPTIONS.map((position) => (
                                <option key={position} value={position}>
                                  {position}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={player.country}
                              onChange={(e) =>
                                updateTeamPlayer(index, {
                                  country: e.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-white outline-none focus:border-cyan-400/60"
                            >
                              {COUNTRY_FLAGS.map((c) => (
                                <option key={c.flag} value={c.flag}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => removeTeamPlayer(index)}
                              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-rose-200 transition hover:bg-rose-500/20"
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    );
  };

  const renderSimpleListTab = ({
    title,
    description,
    items,
    onAdd,
    onChange,
    onRemove,
    onSave,
    renderRow,
    emptyLabel,
  }) => (
    <div className="rounded-[28px] border border-white/8 bg-white/5 p-6 backdrop-blur-xl shadow-2xl shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-semibold">
            {title}
          </p>
          <h2 className="text-2xl font-black text-white mt-1">{description}</h2>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAdd}
            className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/12"
          >
            Adicionar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            Guardar
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => renderRow(item, index, onChange, onRemove))}
        {!items.length && (
          <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/60 p-6 text-sm text-slate-400">
            {emptyLabel}
          </div>
        )}
      </div>
    </div>
  );

  const renderCurrentTab = () => {
    if (activeTab === "teams") return renderTeamsTab();
    if (activeTab === "managers") {
      return renderSimpleListTab({
        title: "Treinadores",
        description: "Lista editável de treinadores",
        items: managers,
        onAdd: addManager,
        onChange: updateManager,
        onRemove: removeManager,
        onSave: () =>
          saveCollection(
            "managers",
            managers,
            "Lista de treinadores guardada.",
          ),
        emptyLabel: "Sem treinadores configurados.",
        renderRow: (item, index, onChange, onRemove) => (
          <div
            key={`manager-${index}`}
            className="flex gap-3 rounded-3xl border border-white/10 bg-slate-950/60 p-4"
          >
            <input
              value={item.name || ""}
              onChange={(e) => onChange(index, e.target.value)}
              className="flex-1 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/60"
              placeholder={`Treinador ${index + 1}`}
            />
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-bold uppercase tracking-[0.18em] text-rose-200 transition hover:bg-rose-500/20"
            >
              Remover
            </button>
          </div>
        ),
      });
    }

    if (activeTab === "referees") {
      return renderSimpleListTab({
        title: "Árbitros",
        description: "Lista editável de árbitros",
        items: referees,
        onAdd: addReferee,
        onChange: updateReferee,
        onRemove: removeReferee,
        onSave: () =>
          saveCollection("referees", referees, "Lista de árbitros guardada."),
        emptyLabel: "Sem árbitros configurados.",
        renderRow: (item, index, onChange, onRemove) => (
          <div
            key={`referee-${index}`}
            className="flex gap-3 rounded-3xl border border-white/10 bg-slate-950/60 p-4"
          >
            <input
              value={item || ""}
              onChange={(e) => onChange(index, e.target.value)}
              className="flex-1 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/60"
              placeholder={`Árbitro ${index + 1}`}
            />
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-bold uppercase tracking-[0.18em] text-rose-200 transition hover:bg-rose-500/20"
            >
              Remover
            </button>
          </div>
        ),
      });
    }

    return renderSimpleListTab({
      title: "Estádios",
      description: "Lista editável de estádios",
      items: stadiums,
      onAdd: addStadium,
      onChange: updateStadium,
      onRemove: removeStadium,
      onSave: () =>
        saveCollection("stadiums", stadiums, "Lista de estádios guardada."),
      emptyLabel: "Sem estádios configurados.",
      renderRow: (item, index, onChange, onRemove) => (
        <div
          key={`stadium-${index}`}
          className="grid gap-3 rounded-3xl border border-white/10 bg-slate-950/60 p-4 md:grid-cols-[minmax(0,1fr)_180px_auto]"
        >
          <input
            value={item.name || ""}
            onChange={(e) => onChange(index, { name: e.target.value })}
            className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/60"
            placeholder={`Estádio ${index + 1}`}
          />
          <input
            type="number"
            min="0"
            value={item.capacity ?? 0}
            onChange={(e) =>
              onChange(index, { capacity: Number(e.target.value) })
            }
            className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/60"
            placeholder="Capacidade"
          />
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-bold uppercase tracking-[0.18em] text-rose-200 transition hover:bg-rose-500/20"
          >
            Remover
          </button>
        </div>
      ),
    });
  };

  return (
    <div className="min-h-screen bg-[#02040c] text-slate-100">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-10%] top-[-10%] h-[40vw] w-[40vw] rounded-full bg-cyan-500/15 blur-[120px]" />
        <div className="absolute right-[-10%] top-[10%] h-[35vw] w-[35vw] rounded-full bg-fuchsia-500/10 blur-[140px]" />
        <div className="absolute bottom-[-12%] left-[20%] h-[30vw] w-[30vw] rounded-full bg-emerald-500/10 blur-[130px]" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-screen-2xl flex-col gap-6 px-4 py-4 lg:px-6">
        <header className="rounded-[28px] border border-white/8 bg-white/5 px-5 py-4 backdrop-blur-xl shadow-2xl shadow-black/20 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400 font-semibold">
                Painel de Administração
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white lg:text-5xl">
                Editor de Fixtures
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">
                Superuser autenticado como {username}. As alterações mexem
                apenas nos ficheiros JSON em server/db/fixtures/ e nas novas
                salas geradas a partir do base.db.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={reseedDatabase}
                disabled={saving}
                className="rounded-2xl bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                Re-seed
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/12"
              >
                Sair
              </button>
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-white/8 bg-white/5 p-4 backdrop-blur-xl shadow-2xl shadow-black/20">
            <div className="mb-4 rounded-3xl border border-white/8 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-semibold">
                Dashboard
              </p>
              <p className="mt-2 text-lg font-black text-white">Ferramentas</p>
            </div>

            <nav className="space-y-2">
              {[
                ["teams", "Equipas"],
                ["managers", "Treinadores"],
                ["referees", "Árbitros"],
                ["stadiums", "Estádios"],
              ].map(([tabKey, label]) => {
                const active = activeTab === tabKey;
                return (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => setActiveTab(tabKey)}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-4 text-left transition ${active ? "bg-cyan-400 text-slate-950" : "bg-slate-950/60 text-slate-300 hover:bg-white/8 hover:text-white"}`}
                  >
                    <span className="text-sm font-bold uppercase tracking-[0.18em]">
                      {label}
                    </span>
                    <span className="text-xs font-black uppercase tracking-[0.24em] opacity-70">
                      {tabKey}
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-4 rounded-3xl border border-white/8 bg-slate-950/60 p-4 text-sm text-slate-400">
              <p className="font-bold text-white">Notas</p>
              <p className="mt-2">
                A edição de equipas inclui cores, estádio, treinador e jogadores
                individuais.
              </p>
            </div>
          </aside>

          <main className="space-y-6">
            <div className="rounded-[28px] border border-white/8 bg-white/5 p-5 backdrop-blur-xl shadow-2xl shadow-black/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-semibold">
                    Estado
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    {loading ? loadingMessage : "Pronto para editar."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                  <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-2">
                    {teams.length} equipas
                  </span>
                  <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-2">
                    {managers.length} treinadores
                  </span>
                  <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-2">
                    {referees.length} árbitros
                  </span>
                  <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-2">
                    {stadiums.length} estádios
                  </span>
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-semibold text-rose-200">
                {error}
              </div>
            )}

            {reseedStatus && (
              <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-200">
                {reseedStatus}
              </div>
            )}

            {activeTab === "teams" && renderTeamsTab()}
            {activeTab !== "teams" && renderCurrentTab()}
          </main>
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;
