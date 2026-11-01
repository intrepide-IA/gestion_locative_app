package expo.modules.lecturetexte

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.common.MlKitException
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.max
import kotlin.math.min

/**
 * Lecture du texte d'une photo ou d'un PDF, entièrement sur le téléphone (ML Kit).
 * Chaque ligne est renvoyée avec sa position : la mise en forme (titres, articles, paragraphes)
 * est reconstituée ensuite en TypeScript.
 */
class LectureTexteModule : Module() {
  private val lecteur by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

  override fun definition() = ModuleDefinition {
    Name("LectureTexte")

    // Les fonctions asynchrones tournent hors du fil principal : on peut attendre ML Kit (Tasks.await).
    AsyncFunction("lireImage") { uri: String ->
      val contexte = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val image = InputImage.fromFilePath(contexte, Uri.parse(uri))
      lire(image, image.width, image.height)
    }

    AsyncFunction("lirePdf") { uri: String, pagesMax: Int ->
      val contexte = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val descripteur = contexte.contentResolver.openFileDescriptor(Uri.parse(uri), "r")
        ?: throw CodedException("Impossible d'ouvrir le PDF.")
      descripteur.use { fd ->
        PdfRenderer(fd).use { rendu ->
          (0 until min(rendu.pageCount, pagesMax)).map { i ->
            rendu.openPage(i).use { page ->
              // Environ 2 000 pixels sur le grand côté : assez net pour lire les petits caractères.
              val echelle = 2000f / max(page.width, page.height)
              val largeur = (page.width * echelle).toInt()
              val hauteur = (page.height * echelle).toInt()
              val bitmap = Bitmap.createBitmap(largeur, hauteur, Bitmap.Config.ARGB_8888)
              bitmap.eraseColor(Color.WHITE)
              page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
              val resultat = lire(InputImage.fromBitmap(bitmap, 0), largeur, hauteur)
              bitmap.recycle()
              resultat
            }
          }
        }
      }
    }
  }

  private fun lire(image: InputImage, largeur: Int, hauteur: Int): Map<String, Any> {
    val texte: Text = try {
      Tasks.await(lecteur.process(image))
    } catch (e: Exception) {
      val cause = e.cause ?: e
      if (cause is MlKitException && cause.errorCode == MlKitException.UNAVAILABLE) {
        throw CodedException("MODELE_INDISPONIBLE", "Le module de lecture est en cours de téléchargement par Google Play. Réessayez dans une minute avec Internet.", cause)
      }
      throw CodedException("LECTURE_IMPOSSIBLE", cause.message ?: "Lecture impossible.", cause)
    }
    val lignes = mutableListOf<Map<String, Any>>()
    texte.textBlocks.forEachIndexed { b, bloc ->
      for (ligne in bloc.lines) {
        val zone = ligne.boundingBox ?: continue
        lignes.add(
          mapOf(
            "texte" to ligne.text,
            "x" to zone.left,
            "y" to zone.top,
            "largeur" to zone.width(),
            "hauteur" to zone.height(),
            "bloc" to b
          )
        )
      }
    }
    // Photo prise de travers : les dimensions tiennent compte de la rotation indiquée par l'image.
    val tourne = image.rotationDegrees == 90 || image.rotationDegrees == 270
    return mapOf(
      "largeur" to (if (tourne) hauteur else largeur),
      "hauteur" to (if (tourne) largeur else hauteur),
      "lignes" to lignes
    )
  }
}
