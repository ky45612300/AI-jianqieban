import { copyFile, exists, remove, stat } from "@tauri-apps/plugin-fs";
import { useAsyncEffect, useReactive } from "ahooks";
import { isString } from "es-toolkit";
import { unionBy } from "es-toolkit/compat";
import { useContext } from "react";
import { getDefaultSaveImagePath } from "tauri-plugin-clipboard-x-api";
import { shouldAcceptClipboardImage } from "@/clipboard-ocr/shared";
import { LISTEN_KEY } from "@/constants";
import { selectHistory } from "@/database/history";
import { MainContext } from "@/pages/Main";
import { isBlank } from "@/utils/is";
import { getSaveImagePath, join } from "@/utils/path";
import { useTauriListen } from "./useTauriListen";

interface Options {
  scrollToTop: () => void;
}

export const useHistoryList = (options: Options) => {
  const { scrollToTop } = options;
  const { rootState } = useContext(MainContext);
  const state = useReactive({
    loading: false,
    noMore: false,
    page: 1,
    size: 20,
  });

  const fetchData = async () => {
    try {
      if (state.loading) return;

      state.loading = true;

      const { page } = state;

      const list = await selectHistory((qb) => {
        const { size } = state;
        const { group, search } = rootState;
        const isFavoriteGroup = group === "favorite";
        const isNormalGroup = group !== "all" && !isFavoriteGroup;

        return qb
          .$if(isFavoriteGroup, (eb) => eb.where("favorite", "=", true))
          .$if(isNormalGroup, (eb) => eb.where("group", "=", group))
          .$if(!isBlank(search), (eb) => {
            return eb.where((eb) => {
              return eb.or([
                eb("search", "like", eb.val(`%${search}%`)),
                eb("note", "like", eb.val(`%${search}%`)),
              ]);
            });
          })
          .offset((page - 1) * size)
          .limit(size)
          .orderBy("createTime", "desc");
      });

      const nextList: typeof list = [];

      for (const item of list) {
        const { type, value } = item;

        if (!isString(value)) {
          nextList.push(item);
          continue;
        }

        if (type === "image") {
          const oldPath = join(getSaveImagePath(), value);
          const newPath = join(await getDefaultSaveImagePath(), value);

          if (await exists(oldPath)) {
            await copyFile(oldPath, newPath);

            remove(oldPath);
          }

          item.value = newPath;

          const fileBytes = await stat(newPath)
            .then((fileInfo) => (fileInfo.isFile ? fileInfo.size : 0))
            .catch(() => 0);

          if (
            !shouldAcceptClipboardImage({
              fileBytes,
              reportedBytes: item.count,
            })
          ) {
            continue;
          }
        }

        if (type === "files") {
          item.value = JSON.parse(value);
        }

        nextList.push(item);
      }

      state.noMore = list.length === 0;

      if (page === 1) {
        rootState.list = nextList;

        if (state.noMore) return;

        return scrollToTop();
      }

      rootState.list = unionBy(rootState.list, nextList, "id");
    } finally {
      state.loading = false;
    }
  };

  const reload = () => {
    state.page = 1;
    state.noMore = false;

    return fetchData();
  };

  const loadMore = () => {
    if (state.noMore) return;

    state.page += 1;

    fetchData();
  };

  useTauriListen(LISTEN_KEY.REFRESH_CLIPBOARD_LIST, reload);

  useAsyncEffect(async () => {
    await reload();

    rootState.activeId = rootState.list[0]?.id;
  }, [rootState.group, rootState.search]);

  return {
    loadMore,
    reload,
  };
};
